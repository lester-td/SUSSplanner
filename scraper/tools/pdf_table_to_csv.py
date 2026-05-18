#!/usr/bin/env python3
import argparse
import csv
from pathlib import Path
import pdfplumber


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_all_rows(pdf_path: Path) -> list[list[str]]:
    rows: list[list[str]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    cleaned = [clean_cell(cell) for cell in row]
                    if any(cell for cell in cleaned):
                        rows.append(cleaned)
    return rows


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
    rows = extract_all_rows(pdf_path)
    write_csv(rows, output_path)
    print(f"Extracted {len(rows)} rows to: {output_path}")


if __name__ == "__main__":
    main()
