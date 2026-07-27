#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber

try:
    from pdf_ocr import ocr_pdf_pages, ocr_pdf_region_text, parse_ocr_languages
except ModuleNotFoundError:
    from tools.pdf_ocr import ocr_pdf_pages, ocr_pdf_region_text, parse_ocr_languages

try:
    from pdf_unicode_repair import (
        build_pdf_page_font_maps,
        font_priority_from_chars,
        has_cid_tokens,
        repair_cid_tokens,
    )
except ModuleNotFoundError:
    from tools.pdf_unicode_repair import (
        build_pdf_page_font_maps,
        font_priority_from_chars,
        has_cid_tokens,
        repair_cid_tokens,
    )


COURSE_CODE_RE = re.compile(r"^([A-Z]{2,6}[0-9]{3}[A-Za-z0-9]*)(?:\s+|$)(.*)$")
COURSE_CODE_IN_TEXT_RE = re.compile(r"\b[A-Z]{2,6}[0-9]{3}[A-Za-z0-9]*\b")
SECTION_CU_RE = re.compile(r"(?:-|–)\s*([0-9]+(?:\.[0-9]+)?)\s*cu\b", re.IGNORECASE)
SECTION_NAME_RE = re.compile(
    r"\b(compulsory|elective|core|major|minor|track|specialisation|specialization|basket|"
    r"free elective|general elective|capacities|retired|replaced)\b",
    re.IGNORECASE,
)
MONTHS = {"Jan": "January", "May": "May", "Jul": "July"}
EMPTY_VALUES = {"", "-", "none", "nil", "n/a", "na"}
CJK_CHAR_CLASS = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"


def clean(value: object) -> str:
    text = unicodedata.normalize("NFC", str(value or "")).replace("\u200c", "").replace("\u200d", "")
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    # PDF line wrapping sometimes inserts spaces in the middle of Chinese words.
    return re.sub(rf"(?<=[{CJK_CHAR_CLASS}])\s+(?=[{CJK_CHAR_CLASS}])", "", text)


def nullable(value: object) -> str | None:
    text = clean(value)
    return None if text.lower() in EMPTY_VALUES else text


def number_or_none(value: object) -> float | None:
    text = clean(value)
    try:
        return float(text)
    except ValueError:
        return None


def normalise_header(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", clean(value).lower()).strip()


def plan_key(relative_path: Path) -> str:
    value = relative_path.with_suffix("").as_posix().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def course_codes(value: str | None) -> list[str]:
    if not value:
        return []
    return list(dict.fromkeys(match.group(0) for match in COURSE_CODE_IN_TEXT_RE.finditer(value)))


def parse_presentation_periods(header: str) -> list[dict[str, Any]]:
    tokens = re.findall(r"Jan|May|Jul|20\d{2}|\d{2}", header, re.IGNORECASE)
    months = [token.title() for token in tokens if token.title() in MONTHS]
    years = [int(token) + 2000 if len(token) == 2 else int(token) for token in tokens if token.isdigit()]
    if len(months) != len(years):
        return []
    return [
        {
            "term": MONTHS[month],
            "year": year,
            "label": f"{month} {year}",
        }
        for month, year in zip(months, years)
    ]


def parse_presentations(value: str | None, periods: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    if not periods:
        return [], []
    markers = re.findall(r"\b(?:Y|N|RT|RP)\b", (value or "").upper())
    warnings: list[str] = []
    if len(markers) != len(periods):
        warnings.append(f"Expected {len(periods)} presentation markers but found {len(markers)}.")
    presentations = [
        {
            **period,
            "sourceMarker": marker,
            "status": {
                "Y": "offered",
                "N": "not_offered",
                "RT": "retired",
                "RP": "replaced",
            }[marker],
            "offered": marker == "Y",
        }
        for period, marker in zip(periods, markers)
    ]
    return presentations, warnings


@dataclass
class Header:
    course: int
    credit_units: int
    prerequisite: int | None = None
    excluded_combination: int | None = None
    grouping: int | None = None
    remarks: int | None = None
    presentation: int | None = None
    last_presentation: int | None = None
    timetable: int | None = None
    status: int | None = None
    effective_from_semester: int | None = None
    periods: list[dict[str, Any]] | None = None


def find_column(headers: list[str], *needles: str) -> int | None:
    for index, header in enumerate(headers):
        if any(needle in header for needle in needles):
            return index
    return None


def parse_header(row: list[str]) -> Header | None:
    headers = [normalise_header(cell) for cell in row]
    course = find_column(headers, "course")
    credit_units = find_column(headers, "credit unit")
    if course is None or credit_units is None:
        return None
    presentation = next(
        (index for index, cell in enumerate(row) if len(re.findall(r"Jan|May|Jul", cell, re.IGNORECASE)) >= 2),
        None,
    )
    return Header(
        course=course,
        credit_units=credit_units,
        prerequisite=find_column(headers, "pre requisite", "prerequisite"),
        excluded_combination=find_column(headers, "excluded combinati", "excluded combination"),
        grouping=find_column(headers, "grouping"),
        remarks=find_column(headers, "remarks"),
        presentation=presentation,
        last_presentation=find_column(headers, "last presentation"),
        timetable=find_column(headers, "time table", "timetable"),
        status=find_column(headers, "status"),
        effective_from_semester=find_column(headers, "effective from semester"),
        periods=parse_presentation_periods(row[presentation]) if presentation is not None else [],
    )


def cell(row: list[str], index: int | None) -> str:
    return row[index] if index is not None and index < len(row) else ""


def looks_like_section(row: list[str], header: Header | None) -> bool:
    if not row or COURSE_CODE_RE.match(cell(row, header.course if header else 0)):
        return False
    nonempty = [value for value in row if value]
    if len(nonempty) != 1:
        return False
    value = nonempty[0]
    return bool(SECTION_CU_RE.search(value) or SECTION_NAME_RE.search(value))


def append_continuation(entry: dict[str, Any], row: list[str], header: Header) -> bool:
    changed = False
    fields = {
        "courseTitle": header.course,
        "prerequisite": header.prerequisite,
        "excludedCombination": header.excluded_combination,
        "grouping": header.grouping,
        "remarks": header.remarks,
        "lastPresentation": header.last_presentation,
        "timetable": header.timetable,
    }
    for field, index in fields.items():
        value = nullable(cell(row, index))
        if not value:
            continue
        entry[field] = f"{entry.get(field) or ''} {value}".strip()
        changed = True
    return changed


def finalise_entry(entry: dict[str, Any]) -> None:
    entry["courseTitle"] = clean(entry.get("courseTitle"))
    entry["prerequisite"] = nullable(entry.get("prerequisite"))
    entry["excludedCombination"] = nullable(entry.get("excludedCombination"))
    entry["grouping"] = nullable(entry.get("grouping"))
    entry["remarks"] = nullable(entry.get("remarks"))
    entry["lastPresentation"] = nullable(entry.get("lastPresentation"))
    entry["timetable"] = nullable(entry.get("timetable"))
    entry["status"] = nullable(entry.get("status"))
    entry["effectiveFromSemester"] = nullable(entry.get("effectiveFromSemester"))
    entry["prerequisiteCourseCodes"] = course_codes(entry["prerequisite"])
    entry["excludedCourseCodes"] = course_codes(entry["excludedCombination"])
    entry["offeredIn"] = [item["label"] for item in entry["presentations"] if item["offered"]]


def title_cell_bbox(pdf_path: Path, entry: dict[str, Any]) -> tuple[float, float, float, float]:
    """Return the union of a course title cell and its continuation rows."""
    page_index = int(entry["sourcePage"]) - 1
    table_index = int(entry["sourceTable"]) - 1
    row_index = int(entry["sourceRow"]) - 1
    with pdfplumber.open(pdf_path) as pdf:
        tables = pdf.pages[page_index].find_tables()
        if table_index >= len(tables):
            raise RuntimeError(f"OCR validation error: source table {table_index + 1} was not found.")
        table = tables[table_index]
        rows = table.extract()
        if row_index >= len(rows):
            raise RuntimeError(f"OCR validation error: source row {row_index + 1} was not found.")

        start_row = rows[row_index]
        course_column = next(
            (index for index, value in enumerate(start_row) if entry["courseCode"] in clean(value)),
            None,
        )
        if course_column is None:
            raise RuntimeError(
                f"OCR validation error: {entry['courseCode']} was not found at its source coordinates."
            )

        boxes: list[tuple[float, float, float, float]] = []
        for index in range(row_index, len(rows)):
            row = rows[index]
            if index > row_index:
                first_cell = clean(row[course_column] if course_column < len(row) else "")
                if COURSE_CODE_RE.match(first_cell) or parse_header([clean(value) for value in row]):
                    break
                if looks_like_section([clean(value) for value in row], None):
                    break
                if not first_cell:
                    break
            row_cells = table.rows[index].cells
            if course_column >= len(row_cells) or row_cells[course_column] is None:
                break
            boxes.append(row_cells[course_column])

        if not boxes:
            raise RuntimeError(f"OCR validation error: title cell for {entry['courseCode']} was not found.")
        return (
            min(box[0] for box in boxes),
            min(box[1] for box in boxes),
            max(box[2] for box in boxes),
            max(box[3] for box in boxes),
        )


def apply_cid_ocr(
    pdf_path: Path,
    input_root: Path,
    plan: dict[str, Any],
    entries: list[dict[str, Any]],
    *,
    ocr_output_root: Path,
    languages: list[str],
) -> None:
    affected = [
        entry for entry in entries
        if any(has_cid_tokens(entry.get(field) or "") for field in (
            "courseTitle", "prerequisite", "excludedCombination", "grouping", "remarks"
        ))
    ]
    if not affected:
        return

    pages = sorted({int(entry["sourcePage"]) for entry in affected})
    relative_path = pdf_path.relative_to(input_root)
    generated_pdf = ocr_output_root / relative_path
    sidecar = generated_pdf.with_suffix(".txt")
    ocr_pdf_pages(
        pdf_path,
        generated_pdf,
        pages=",".join(str(page) for page in pages),
        languages=languages,
        sidecar_output=sidecar,
    )

    corrected_codes: list[str] = []
    for entry in affected:
        # The current affected source fields are course titles. Other fields stay
        # untouched unless they can be isolated just as safely in a future pass.
        if not has_cid_tokens(entry.get("courseTitle") or ""):
            continue
        bbox = title_cell_bbox(pdf_path, entry)
        ocr_text = clean(ocr_pdf_region_text(
            pdf_path,
            page_number=int(entry["sourcePage"]),
            bbox=bbox,
            languages=languages,
        ))
        match = re.match(rf"^{re.escape(entry['courseCode'])}\s+(.+)$", ocr_text)
        if not match:
            raise RuntimeError(
                f"OCR validation error: OCR title for {entry['courseCode']} did not preserve its course code."
            )
        replacement = clean(match.group(1))
        if not replacement or has_cid_tokens(replacement):
            raise RuntimeError(
                f"OCR validation error: OCR title for {entry['courseCode']} is empty or still contains CID glyphs."
            )
        entry["courseTitle"] = replacement
        entry["ocrCorrection"] = {
            "field": "courseTitle",
            "source": "cropped_cell_ocr",
            "languages": languages,
        }
        corrected_codes.append(entry["courseCode"])

    plan["ocr"] = {
        "pages": pages,
        "languages": languages,
        "generatedPdf": generated_pdf.as_posix(),
        "sidecar": sidecar.as_posix(),
        "correctedCourseCodes": corrected_codes,
    }


def parse_plan(
    pdf_path: Path,
    input_root: Path,
    *,
    ocr_on_cid: bool = False,
    ocr_output_root: Path | None = None,
    ocr_languages: list[str] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    relative_path = pdf_path.relative_to(input_root)
    parts = relative_path.parts
    category = parts[0] if len(parts) > 1 else "uncategorised"
    study_mode = next((part for part in parts if part in {"full-time", "part-time"}), None)
    key = plan_key(relative_path)
    plan = {
        "planKey": key,
        "programmeName": clean(pdf_path.stem),
        "category": category,
        "studyMode": study_mode,
        "sourcePath": relative_path.as_posix(),
    }
    entries: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    current_section: str | None = None
    current_header: Header | None = None
    course_like_row_count = 0

    page_font_maps = build_pdf_page_font_maps(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        plan["pageCount"] = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages, start=1):
            fonts_for_page = page_font_maps[page_number - 1] if page_number - 1 < len(page_font_maps) else {}
            font_priority = font_priority_from_chars(page.chars)
            cid_maps = [fonts_for_page[name] for name in font_priority if name in fonts_for_page]
            tables = page.extract_tables() or []
            for table_number, table in enumerate(tables, start=1):
                header = current_header
                active_entry: dict[str, Any] | None = None
                for row_number, raw_row in enumerate(table, start=1):
                    row = [clean(repair_cid_tokens(clean(value), cid_maps)) for value in raw_row]
                    raw_course_match = COURSE_CODE_RE.match(row[0] if row else "")
                    if raw_course_match:
                        course_like_row_count += 1
                    detected_header = parse_header(row)
                    if detected_header:
                        if active_entry:
                            finalise_entry(active_entry)
                            entries.append(active_entry)
                            active_entry = None
                        header = detected_header
                        current_header = detected_header
                        continue
                    if looks_like_section(row, header):
                        if active_entry:
                            finalise_entry(active_entry)
                            entries.append(active_entry)
                            active_entry = None
                        current_section = next(value for value in row if value)
                        continue
                    if not header:
                        if raw_course_match:
                            issues.append({
                                "planKey": key,
                                "courseCode": raw_course_match.group(1),
                                "sourcePage": page_number,
                                "severity": "error",
                                "issue": "Course-like row was found without a recognised table header.",
                            })
                        continue

                    course_match = COURSE_CODE_RE.match(cell(row, header.course))
                    if course_match:
                        if active_entry:
                            finalise_entry(active_entry)
                            entries.append(active_entry)
                        periods = header.periods or []
                        presentations, presentation_warnings = parse_presentations(
                            nullable(cell(row, header.presentation)), periods
                        )
                        source_key = f"{key}:p{page_number}:t{table_number}:r{row_number}"
                        active_entry = {
                            "entryKey": source_key,
                            "planKey": key,
                            "section": current_section,
                            "sectionCreditUnits": number_or_none(
                                SECTION_CU_RE.search(current_section).group(1)
                                if current_section and SECTION_CU_RE.search(current_section)
                                else None
                            ),
                            "recordType": "historical" if header.status is not None else "offering",
                            "courseCode": course_match.group(1),
                            "courseTitle": course_match.group(2).strip(),
                            "creditUnits": number_or_none(cell(row, header.credit_units)),
                            "creditUnitsRaw": nullable(cell(row, header.credit_units)),
                            "prerequisite": nullable(cell(row, header.prerequisite)),
                            "excludedCombination": nullable(cell(row, header.excluded_combination)),
                            "grouping": nullable(cell(row, header.grouping)),
                            "remarks": nullable(cell(row, header.remarks)),
                            "presentations": presentations,
                            "lastPresentation": nullable(cell(row, header.last_presentation)),
                            "timetable": nullable(cell(row, header.timetable)),
                            "status": nullable(cell(row, header.status)),
                            "effectiveFromSemester": nullable(cell(row, header.effective_from_semester)),
                            "sourcePage": page_number,
                            "sourceTable": table_number,
                            "sourceRow": row_number,
                            "warnings": presentation_warnings,
                        }
                        for warning in presentation_warnings:
                            issues.append({
                                "planKey": key,
                                "courseCode": active_entry["courseCode"],
                                "sourcePage": page_number,
                                "severity": "warning",
                                "issue": warning,
                            })
                        continue

                    if active_entry and any(row):
                        append_continuation(active_entry, row, header)

                if active_entry:
                    finalise_entry(active_entry)
                    entries.append(active_entry)

    if ocr_on_cid:
        if ocr_output_root is None or not ocr_languages:
            raise ValueError("OCR output directory and languages are required when CID OCR is enabled.")
        apply_cid_ocr(
            pdf_path,
            input_root,
            plan,
            entries,
            ocr_output_root=ocr_output_root,
            languages=ocr_languages,
        )

    for entry in entries:
        if entry["planKey"] != key:
            continue
        text_fields = [entry.get("courseTitle"), entry.get("prerequisite"), entry.get("excludedCombination"), entry.get("remarks")]
        if any(has_cid_tokens(value or "") for value in text_fields):
            warning = "Unresolved CID glyphs remain after embedded-font repair."
            entry["warnings"].append(warning)
            issues.append({
                "planKey": key,
                "courseCode": entry["courseCode"],
                "sourcePage": entry["sourcePage"],
                "severity": "warning",
                "issue": warning,
            })

    plan["courseLikeRowCount"] = course_like_row_count
    plan["entryCount"] = len(entries)
    if course_like_row_count != len(entries):
        issues.append({
            "planKey": key,
            "courseCode": "",
            "sourcePage": "",
            "severity": "error",
            "issue": f"Found {course_like_row_count} course-like rows but produced {len(entries)} entries.",
        })

    return plan, entries, issues


def sql_string(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value: object) -> str:
    return f"{sql_string(json.dumps(value, ensure_ascii=False))}::jsonb"


def generate_preview_sql(plans: list[dict[str, Any]], entries: list[dict[str, Any]]) -> str:
    lines = [
        "-- PREVIEW ONLY: curriculum tables are not part of the current application schema.",
        "-- Review the JSON and agree on a schema before attempting to import this file.",
        "BEGIN;",
    ]
    for plan in plans:
        lines.append(
            "INSERT INTO curriculum_plans "
            "(plan_key, programme_name, category, study_mode, source_path, page_count) VALUES ("
            f"{sql_string(plan['planKey'])}, {sql_string(plan['programmeName'])}, "
            f"{sql_string(plan['category'])}, {sql_string(plan['studyMode'])}, "
            f"{sql_string(plan['sourcePath'])}, {plan['pageCount']});"
        )
    for entry in entries:
        lines.append(
            "INSERT INTO curriculum_plan_courses ("
            "entry_key, plan_key, section_name, section_credit_units, record_type, course_code, course_title, "
            "credit_units, prerequisite_text, prerequisite_course_codes, excluded_combination_text, "
            "excluded_course_codes, grouping_text, remarks, presentations, last_presentation, timetable, "
            "status, effective_from_semester, source_page, source_table, source_row"
            ") VALUES ("
            f"{sql_string(entry['entryKey'])}, {sql_string(entry['planKey'])}, {sql_string(entry['section'])}, "
            f"{entry['sectionCreditUnits'] if entry['sectionCreditUnits'] is not None else 'NULL'}, "
            f"{sql_string(entry['recordType'])}, {sql_string(entry['courseCode'])}, {sql_string(entry['courseTitle'])}, "
            f"{entry['creditUnits'] if entry['creditUnits'] is not None else 'NULL'}, "
            f"{sql_string(entry['prerequisite'])}, {sql_json(entry['prerequisiteCourseCodes'])}, "
            f"{sql_string(entry['excludedCombination'])}, {sql_json(entry['excludedCourseCodes'])}, "
            f"{sql_string(entry['grouping'])}, {sql_string(entry['remarks'])}, {sql_json(entry['presentations'])}, "
            f"{sql_string(entry['lastPresentation'])}, {sql_string(entry['timetable'])}, {sql_string(entry['status'])}, "
            f"{sql_string(entry['effectiveFromSemester'])}, {entry['sourcePage']}, {entry['sourceTable']}, {entry['sourceRow']});"
        )
    lines.append("COMMIT;")
    return "\n\n".join(lines) + "\n"


def write_issues(path: Path, issues: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["plan_key\tcourse_code\tsource_page\tseverity\tissue"]
    for issue in issues:
        lines.append("\t".join([
            str(issue.get("planKey", "")),
            str(issue.get("courseCode", "")),
            str(issue.get("sourcePage", "")),
            str(issue.get("severity", "")),
            clean(issue.get("issue", "")),
        ]))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse SUSS curriculum-plan PDFs into reviewable JSON or preview SQL.")
    parser.add_argument("--input-dir", type=Path, default=Path("data/input/curriculum-plans"))
    parser.add_argument("--json", type=Path, default=Path("data/output/curriculum/curriculum-plans.json"))
    parser.add_argument("--out", type=Path, default=Path("data/output/curriculum/curriculum-plans.preview.sql"))
    parser.add_argument("--issues-out", type=Path, default=Path("data/output/curriculum/issues.tsv"))
    parser.add_argument("--format", choices=("json", "sql", "both"), default="both")
    parser.add_argument(
        "--ocr-on-cid",
        action="store_true",
        help="OCR only title cells on pages that still contain unresolved CID glyphs",
    )
    parser.add_argument(
        "--ocr-output-dir",
        type=Path,
        default=Path("data/output/curriculum/ocr-pdfs"),
        help="Folder for generated OCR PDF copies; source PDFs are never overwritten",
    )
    parser.add_argument(
        "--ocr-languages",
        default="eng,tam",
        help="Comma-separated Tesseract languages used by the CID OCR fallback",
    )
    args = parser.parse_args()

    ocr_languages = parse_ocr_languages(args.ocr_languages)
    if args.ocr_on_cid and not ocr_languages:
        raise ValueError("At least one OCR language is required.")

    pdf_paths = sorted(args.input_dir.rglob("*.pdf"))
    if not pdf_paths:
        raise SystemExit(f"No curriculum-plan PDFs found in {args.input_dir}")

    plans: list[dict[str, Any]] = []
    entries: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    for index, pdf_path in enumerate(pdf_paths, start=1):
        print(f"[{index}/{len(pdf_paths)}] Parsing {pdf_path.relative_to(args.input_dir)}")
        plan, plan_entries, plan_issues = parse_plan(
            pdf_path,
            args.input_dir,
            ocr_on_cid=args.ocr_on_cid,
            ocr_output_root=args.ocr_output_dir,
            ocr_languages=ocr_languages,
        )
        plans.append(plan)
        entries.extend(plan_entries)
        issues.extend(plan_issues)

    payload = {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceDirectory": args.input_dir.as_posix(),
            "planCount": len(plans),
            "entryCount": len(entries),
            "courseLikeRowCount": sum(plan["courseLikeRowCount"] for plan in plans),
            "issueCount": len(issues),
            "notes": [
                "Course rows are programme-plan-specific and are not merged globally.",
                "Prerequisite and exclusion logic is preserved as source text plus referenced course-code lists.",
                "SQL output targets provisional tables that do not exist in the current schema.",
                "CID OCR is limited to affected title cells and never overwrites source PDFs.",
            ],
        },
        "plans": plans,
        "entries": entries,
    }

    if args.format in {"json", "both"}:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON written to: {args.json}")
    if args.format in {"sql", "both"}:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(generate_preview_sql(plans, entries), encoding="utf-8")
        print(f"Preview SQL written to: {args.out}")

    write_issues(args.issues_out, issues)
    print(f"Plans parsed: {len(plans)}")
    print(f"Curriculum entries parsed: {len(entries)}")
    print(f"Issues: {len(issues)}")
    print(f"Issues written to: {args.issues_out}")


if __name__ == "__main__":
    main()
