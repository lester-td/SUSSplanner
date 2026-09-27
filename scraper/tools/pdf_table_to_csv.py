#!/usr/bin/env python3
import argparse
import csv
import sys
from pathlib import Path
import pdfplumber

from pdf_unicode_repair import (
    build_pdf_page_font_maps,
    font_priority_from_chars,
    has_cid_tokens,
    repair_cid_tokens,
)


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_all_rows(pdf_path: Path) -> tuple[list[list[str]], list[str]]:
    rows: list[list[str]] = []
    warnings: list[str] = []
    page_font_maps = build_pdf_page_font_maps(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            fonts_for_page = page_font_maps[index - 1] if index - 1 < len(page_font_maps) else {}
            cid_font_priority = font_priority_from_chars(page.chars)
            cid_maps = [fonts_for_page[font_name] for font_name in cid_font_priority if font_name in fonts_for_page]

            tables = page.extract_tables() or []
            page_rows: list[list[str]] = []
            for table in tables:
                for row in table:
                    cleaned = [clean_cell(repair_cid_tokens(clean_cell(cell), cid_maps)) for cell in row]
                    if any(cell for cell in cleaned):
                        rows.append(cleaned)
                        page_rows.append(cleaned)
            if any(has_cid_tokens(cell) for row in page_rows for cell in row):
                warnings.append(
                    f"Page {index}: unresolved CID glyphs remain after font repair; "
                    "this PDF may need OCR for complete Tamil text recovery."
                )
    return rows, warnings


def write_csv(rows: list[list[str]], csv_path: Path) -> None:
    if not rows:
        raise ValueError("No table rows were extracted from the PDF.")
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    max_columns = max(len(row) for row in rows)
    normalized_rows = [row + [""] * (max_columns - len(row)) for row in rows]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(normalized_rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract all table rows/columns from a PDF into a CSV file.")
    parser.add_argument("pdf", type=Path, help="Path to input PDF file")
    parser.add_argument("-o", "--output", type=Path, default=Path("output.csv"), help="Path to output CSV file")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pdf_path = args.pdf.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    rows, warnings = extract_all_rows(pdf_path)
    write_csv(rows, output_path)
    for warning in warnings:
        print(warning, file=sys.stderr)
    print(f"Extracted {len(rows)} rows to: {output_path}")


if __name__ == "__main__":
    main()
