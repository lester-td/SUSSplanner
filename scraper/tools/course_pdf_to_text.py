#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import pdfplumber


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def extract_course_pdf(pdf_path: Path) -> dict:
    pages: list[dict] = []
    combined_parts: list[str] = []

    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            tables = page.extract_tables() or []

            table_rows: list[list[str]] = []
            table_text_lines: list[str] = []
            for table in tables:
                for row in table:
                    cleaned = [clean_cell(cell) for cell in row]
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

    return {"source": str(pdf_path), "text": "\n".join(combined_parts), "pages": pages}


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

    if not args.output and not args.json:
        print(result["text"])


if __name__ == "__main__":
    main()
