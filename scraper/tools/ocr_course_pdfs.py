#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path

from pdf_ocr import ocr_pdf_pages, parse_ocr_languages


def parse_prefixes(value: str) -> tuple[str, ...]:
    return tuple(item.strip().upper() for item in value.split(",") if item.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description="Create OCR-corrected copies of downloaded course PDFs.")
    parser.add_argument("--input-dir", type=Path, default=Path("data/input/course-pdfs"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/output/course-pdfs-ocr"))
    parser.add_argument("--code-prefix", default="", help="Optional comma-separated course-code prefixes")
    parser.add_argument("--pages", default="1", help="OCRmyPDF page selection; defaults to page 1")
    parser.add_argument("--languages", default="eng,tam", help="Comma-separated Tesseract language codes")
    parser.add_argument("--force", action="store_true", help="Regenerate OCR PDFs that already exist")
    args = parser.parse_args()

    input_dir = args.input_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    prefixes = parse_prefixes(args.code_prefix)
    languages = parse_ocr_languages(args.languages)

    if not input_dir.exists():
        raise FileNotFoundError(f"Course PDF directory not found: {input_dir}")
    if not languages:
        raise ValueError("At least one OCR language is required.")

    source_pdfs = sorted(
        pdf
        for pdf in input_dir.rglob("*.pdf")
        if not prefixes or pdf.stem.upper().startswith(prefixes)
    )
    if not source_pdfs:
        raise FileNotFoundError(f"No matching course PDFs found in {input_dir}")

    processed = 0
    skipped = 0
    for source_pdf in source_pdfs:
        output_pdf = output_dir / source_pdf.relative_to(input_dir)
        if output_pdf.exists() and not args.force:
            print(f"Skipping existing OCR PDF: {output_pdf}")
            skipped += 1
            continue

        print(f"OCR {source_pdf} -> {output_pdf}")
        ocr_pdf_pages(
            source_pdf,
            output_pdf,
            pages=args.pages,
            languages=languages,
            sidecar_output=output_pdf.with_suffix(".txt"),
        )
        processed += 1

    print(f"OCR PDFs created: {processed}")
    print(f"Existing OCR PDFs skipped: {skipped}")
    print(f"OCR output directory: {output_dir}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
