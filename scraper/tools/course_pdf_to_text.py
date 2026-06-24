#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path
import pdfplumber
from pdfplumber import utils

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


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract text and tables from a SUSS course synopsis PDF.")
    parser.add_argument("pdf", type=Path, help="Path to input course PDF")
    parser.add_argument("-o", "--output", type=Path, help="Path to output text file")
    parser.add_argument("--json", type=Path, help="Optional path to output JSON dump")
    args = parser.parse_args()

    pdf_path = args.pdf.expanduser().resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    result = extract_course_pdf(pdf_path)

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
    main()
