#!/usr/bin/env python3
import argparse
import json
import re
import sys
import tempfile
from pathlib import Path
import pdfplumber
from pdfplumber import utils

from pdf_ocr import ocr_pdf_pages, parse_ocr_languages

from pdf_unicode_repair import (
    build_pdf_page_font_maps,
    font_priority_from_chars,
    has_cid_tokens,
    repair_chars,
    repair_cid_tokens,
)


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_course_pdf(pdf_path: Path) -> dict:
    pages: list[dict] = []
    combined_parts: list[str] = []
    warnings: list[str] = []
    page_font_maps = build_pdf_page_font_maps(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            fonts_for_page = page_font_maps[index - 1] if index - 1 < len(page_font_maps) else {}
            cid_font_priority = font_priority_from_chars(page.chars)
            cid_maps = [fonts_for_page[font_name] for font_name in cid_font_priority if font_name in fonts_for_page]

            repaired_chars, _ = repair_chars(page.chars, fonts_for_page)
            text = utils.extract_text(repaired_chars) or ""
            text = repair_cid_tokens(text, cid_maps)
            tables = page.extract_tables() or []

            table_rows: list[list[str]] = []
            table_text_lines: list[str] = []
            for table in tables:
                for row in table:
                    cleaned = [clean_cell(repair_cid_tokens(clean_cell(cell), cid_maps)) for cell in row]
                    if any(cleaned):
                        table_rows.append(cleaned)
                        table_text_lines.append(" | ".join(cleaned))

            page_text_parts = [f"--- PAGE {index} TEXT ---"]
            if text.strip():
                page_text_parts.append(text.strip())
            if table_text_lines:
                page_text_parts.append(f"--- PAGE {index} TABLES ---")
                page_text_parts.extend(table_text_lines)

            combined_parts.append("\n".join(page_text_parts))
            pages.append({"page": index, "text": text, "tables": table_rows})

            if has_cid_tokens(text) or any(has_cid_tokens(cell) for row in table_rows for cell in row):
                warnings.append(
                    f"Page {index}: unresolved CID glyphs remain after font repair; "
                    "this PDF may need OCR for complete Tamil text recovery."
                )

    return {"source": str(pdf_path), "text": "\n".join(combined_parts), "pages": pages, "warnings": warnings}


def rebuild_combined_text(result: dict) -> None:
    combined_parts: list[str] = []
    warnings: list[str] = []
    for page in result.get("pages", []):
        page_number = int(page["page"])
        text = str(page.get("text") or "")
        tables = page.get("tables", [])
        page_text_parts = [f"--- PAGE {page_number} TEXT ---"]
        if text.strip():
            page_text_parts.append(text.strip())
        table_text_lines = [" | ".join(clean_cell(cell) for cell in row) for row in tables if any(row)]
        if table_text_lines:
            page_text_parts.append(f"--- PAGE {page_number} TABLES ---")
            page_text_parts.extend(table_text_lines)
        combined_parts.append("\n".join(page_text_parts))

        if has_cid_tokens(text) or any(has_cid_tokens(cell) for row in tables for cell in row):
            warnings.append(
                f"Page {page_number}: unresolved CID glyphs remain after font repair; "
                "this PDF may need OCR for complete Tamil text recovery."
            )

    result["text"] = "\n".join(combined_parts)
    result["warnings"] = warnings


def apply_ocr_sidecar(result: dict, sidecar_path: Path, pages: list[int]) -> None:
    sidecar_pages = sidecar_path.read_text(encoding="utf-8").split("\f")
    result_pages = {int(page["page"]): page for page in result.get("pages", [])}

    for page_number in pages:
        sidecar_index = page_number - 1
        if sidecar_index >= len(sidecar_pages):
            raise RuntimeError(f"OCR validation error: sidecar text is missing page {page_number}.")
        ocr_text = sidecar_pages[sidecar_index].strip()
        if not ocr_text or ocr_text.startswith("[OCR skipped on page"):
            raise RuntimeError(f"OCR validation error: no OCR text was produced for page {page_number}.")
        if page_number not in result_pages:
            raise RuntimeError(f"OCR validation error: source extraction is missing page {page_number}.")

        # Tesseract's sidecar contains direct Unicode text and avoids the generated
        # PDF font layer, which can expose Tamil combining glyphs as fresh CIDs.
        result_pages[page_number]["text"] = ocr_text
        result_pages[page_number]["tables"] = []

    rebuild_combined_text(result)


def unresolved_cid_pages(result: dict) -> list[int]:
    unresolved: list[int] = []
    for page in result.get("pages", []):
        text_has_cids = has_cid_tokens(page.get("text"))
        tables_have_cids = any(
            has_cid_tokens(cell)
            for row in page.get("tables", [])
            for cell in row
        )
        if text_has_cids or tables_have_cids:
            unresolved.append(int(page["page"]))
    return unresolved


def original_topic_bullet_count(result: dict) -> int | None:
    match = re.search(
        r"(?:^|\n)\s*(?:Course\s+Topics|Topics)\s*:\s*([\s\S]*?)(?=\n\s*(?:Textbooks|References)\s*:)",
        str(result.get("text") or ""),
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    count = len(re.findall(r"[●•]", match.group(1)))
    return count or None


def extract_with_ocr_fallback(
    pdf_path: Path,
    *,
    ocr_output: Path | None,
    languages: list[str],
) -> dict:
    initial = extract_course_pdf(pdf_path)
    pages = unresolved_cid_pages(initial)
    if not pages:
        return initial

    page_selection = ",".join(str(page) for page in pages)
    expected_topic_count = original_topic_bullet_count(initial)

    if ocr_output is not None:
        resolved_output = ocr_output.expanduser().resolve()
        sidecar_output = resolved_output.with_suffix(".txt")
        ocr_pdf_pages(
            pdf_path,
            resolved_output,
            pages=page_selection,
            languages=languages,
            sidecar_output=sidecar_output,
        )
        result = initial
        apply_ocr_sidecar(result, sidecar_output, pages)
        remaining_pages = unresolved_cid_pages(result)
        if remaining_pages:
            raise RuntimeError(
                "OCR validation error: unresolved CID glyphs remain on page(s) "
                f"{', '.join(str(page) for page in remaining_pages)}. "
                "Verify that Noto Sans Tamil is installed with "
                "`fc-list ':family=Noto Sans Tamil' file`."
            )
        result["source"] = str(pdf_path)
        result["ocr"] = {
            "output": str(resolved_output),
            "sidecar": str(sidecar_output),
            "pages": pages,
            "languages": languages,
            "expectedTopicCount": expected_topic_count,
        }
        return result

    with tempfile.TemporaryDirectory(prefix="course-pdf-ocr-") as temp_dir:
        temporary_output = Path(temp_dir) / pdf_path.name
        temporary_sidecar = Path(temp_dir) / f"{pdf_path.stem}.txt"
        ocr_pdf_pages(
            pdf_path,
            temporary_output,
            pages=page_selection,
            languages=languages,
            sidecar_output=temporary_sidecar,
        )
        result = initial
        apply_ocr_sidecar(result, temporary_sidecar, pages)

    remaining_pages = unresolved_cid_pages(result)
    if remaining_pages:
        raise RuntimeError(
            "OCR validation error: unresolved CID glyphs remain on page(s) "
            f"{', '.join(str(page) for page in remaining_pages)}. "
            "Verify that Noto Sans Tamil is installed with "
            "`fc-list ':family=Noto Sans Tamil' file`."
        )

    result["source"] = str(pdf_path)
    result["ocr"] = {
        "output": None,
        "pages": pages,
        "languages": languages,
        "expectedTopicCount": expected_topic_count,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text and tables from a SUSS course synopsis PDF.")
    parser.add_argument("pdf", type=Path, help="Path to input course PDF")
    parser.add_argument("-o", "--output", type=Path, help="Path to output text file")
    parser.add_argument("--json", type=Path, help="Optional path to output JSON dump")
    parser.add_argument(
        "--ocr-on-cid",
        action="store_true",
        help="OCR pages that still contain unresolved CID glyphs after font repair",
    )
    parser.add_argument("--ocr-output", type=Path, help="Optional path for the generated OCR PDF copy")
    parser.add_argument(
        "--ocr-languages",
        default="eng,tam",
        help="Comma-separated Tesseract languages used by the CID OCR fallback",
    )
    args = parser.parse_args()

    pdf_path = args.pdf.expanduser().resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    languages = parse_ocr_languages(args.ocr_languages)
    if args.ocr_on_cid and not languages:
        raise ValueError("At least one OCR language is required.")

    result = (
        extract_with_ocr_fallback(pdf_path, ocr_output=args.ocr_output, languages=languages)
        if args.ocr_on_cid
        else extract_course_pdf(pdf_path)
    )

    if args.output:
        output_path = args.output.expanduser().resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(result["text"], encoding="utf-8")

    if args.json:
        json_path = args.json.expanduser().resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    for warning in result.get("warnings", []):
        print(warning, file=sys.stderr)

    if not args.output and not args.json:
        print(result["text"])


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
