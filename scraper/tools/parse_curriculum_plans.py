#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
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
COURSE_CODE_IN_TEXT_RE = re.compile(r"\b[A-Z]{2,6}[0-9]{3}[A-Za-z0-9]*\b", re.IGNORECASE)
PARSER_CONTRACT_VERSION = 2
SECTION_CU_RE = re.compile(r"(?:-|–)\s*([0-9]+(?:\.[0-9]+)?)\s*cu\b", re.IGNORECASE)
SECTION_NAME_RE = re.compile(
    r"\b(compulsory|elective|core|major|minor|track|specialisation|specialization|basket|"
    r"free elective|general elective|capacities|retired|replaced)\b",
    re.IGNORECASE,
)
MONTHS = {"Jan": "January", "May": "May", "Jul": "July"}
EMPTY_VALUES = {"", "-", "none", "nil", "n/a", "na"}
CJK_CHAR_CLASS = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
TAMIL_COURSE_PREFIXES = ("TLL",)


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


def repair_course_code_spacing(value: str) -> str:
    # Join uppercase course-code fragments, never operators or ordinary words.
    def join(match: re.Match[str]) -> str:
        prefix = match.group(1) + match.group(2)
        if match.group(1) in {"AND", "OR", "CU"} or len(prefix) > 6:
            return match.group(0)
        return prefix + match.group(3)
    for _ in range(5):
        repaired = re.sub(r"\b([A-Z]{1,5})\s+([A-Z]{1,5})(\d{3}[A-Za-z0-9]*)\b", join, value)
        if repaired == value:
            break
        value = repaired
    value = re.sub(r"\b([A-Z]{2,6})\s+(\d{3}[A-Za-z0-9]*)\b", lambda match: match.group(0) if match.group(1) in {"AND", "OR", "CU"} else "".join(match.groups()), value)
    return re.sub(r"\b([A-Z]{2,6})(\d{1,2})\s+(\d{1,2})([A-Za-z0-9]*)\b", lambda match: "".join(match.groups()) if len(match.group(2) + match.group(3)) == 3 and match.group(1) not in {"AND", "OR", "CU"} else match.group(0), value)


def normalize_prerequisite_text(value: str) -> str:
    text = repair_course_code_spacing(clean(value))
    # These observed PDF word splits are repaired only for parsing/display;
    # source fields and evidence always retain the extracted original wording.
    for fragment, replacement in [(r"programmin\s+g", "programming"), (r"managemen\s+t", "management"), (r"undergradu\s+ate", "undergraduate"), (r"specialisatio\s+n", "specialisation"), (r"requirement\s+s", "requirements"), (r"concur\s+rently", "concurrently"), (r"recommend\s+ed", "recommended"), (r"recommen\s+d(?:ed)?", "recommend"), (r"organisatio\s+nal", "Organisational"), (r"prerequisite\s+s", "prerequisites"), (r"programme\s+s", "programmes"), (r"mandato\s+ry", "mandatory")]:
        text = re.sub(fragment, replacement, text, flags=re.IGNORECASE)
    return text


def course_codes(value: str | None) -> list[str]:
    if not value:
        return []
    repaired = repair_course_code_spacing(value)
    return list(dict.fromkeys(match.group(0) for match in COURSE_CODE_IN_TEXT_RE.finditer(repaired)))


def normalized_course_code(value: str) -> str:
    return repair_course_code_spacing(clean(value).upper())


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
    course_prefixes: tuple[str, ...] | None = None,
) -> None:
    affected = [
        entry for entry in entries
        if (
            course_prefixes is None
            or any(clean(entry.get("courseCode")).upper().startswith(prefix) for prefix in course_prefixes)
        )
        and any(has_cid_tokens(entry.get(field) or "") for field in (
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
    ocr_course_prefixes: tuple[str, ...] = (),
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
        "sourceHash": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
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

    if ocr_on_cid or ocr_course_prefixes:
        if ocr_output_root is None or not ocr_languages:
            raise ValueError("OCR output directory and languages are required when CID OCR is enabled.")
        apply_cid_ocr(
            pdf_path,
            input_root,
            plan,
            entries,
            ocr_output_root=ocr_output_root,
            languages=ocr_languages,
            course_prefixes=None if ocr_on_cid else ocr_course_prefixes,
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


def parse_credit_unit_range(section: str | None) -> tuple[float | None, float | None]:
    if not section:
        return None, None
    match = re.search(
        r"(?:-|–)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:to\s*([0-9]+(?:\.[0-9]+)?))?\s*cu\b",
        section,
        flags=re.IGNORECASE,
    )
    if not match:
        return None, None
    minimum = float(match.group(1))
    maximum = float(match.group(2)) if match.group(2) else minimum
    return minimum, maximum


def parse_required_course_count(section: str | None) -> int | None:
    if not section:
        return None
    patterns = (
        r"\bcomplete\s+([0-9]+)\s+courses?\b",
        r"\bchoose\s+(?:any\s+)?([0-9]+)\b(?:\s+of\s+the\s+[0-9]+)?\s+(?:courses?|electives?)\b",
        r"\bminimum\s+([0-9]+)\s+courses?\b",
    )
    for pattern in patterns:
        match = re.search(pattern, section, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def requirement_type(section: str | None) -> str:
    value = clean(section).lower()
    if "specialisation elective" in value or "specialization elective" in value:
        return "specialisation_elective"
    if "restricted elective" in value:
        return "restricted_elective"
    if "free elective" in value or "unrestricted elective" in value:
        return "free_elective"
    if "elective" in value:
        return "elective"
    if "compulsory" in value or "core" in value:
        return "compulsory"
    return "other"


def requirement_name(section: str | None) -> str:
    value = clean(section) or "Unsectioned courses"
    return re.split(r"\s+(?:-|–)\s+[0-9]", value, maxsplit=1)[0].strip()


def requirement_selection_rule(
    section: str | None,
    kind: str,
    minimum_credit_units: float | None,
    maximum_credit_units: float | None,
    required_course_count: int | None,
) -> str:
    value = clean(section).lower()
    if required_course_count is not None:
        return "choose_courses"
    if kind in {"elective", "free_elective", "restricted_elective", "specialisation_elective"}:
        return "choose_credit_units" if maximum_credit_units is not None else "review_required"
    if kind == "compulsory":
        if minimum_credit_units != maximum_credit_units or "from the list" in value:
            return "choose_credit_units"
        return "all"
    return "review_required"


def parse_effective_term(value: str | None) -> tuple[int | None, str | None]:
    if not value:
        return None, None
    match = re.search(r"\b(20\d{2})[/-](01|05|07)\b", value)
    if not match:
        return None, None
    period = {"01": "January", "05": "May", "07": "July"}[match.group(2)]
    return int(match.group(1)), period


def prerequisite_rule(raw_text: str, codes: list[str], *, allow_conditions: bool = True) -> tuple[str, str, dict[str, Any] | None]:
    """Parse complete course expressions, preserving explicit logical groups.

    Comma enumerations mean ALL courses. Unparenthesized mixed expressions
    require every OR alternative to be an AND group; asymmetric wording such as
    A OR B AND C remains ambiguous. Suggestions still require batch approval.
    """
    text = normalize_prerequisite_text(raw_text)
    fallback = ("mixed" if codes else "condition", "review_required" if codes else "unparsed", None)
    if len(text.encode("utf-8")) > 4096:
        return fallback
    if allow_conditions:
        conditioned = prerequisite_condition_rule(text)
        if conditioned is not None:
            try:
                candidate = normalize_prerequisite_rule(conditioned)
                return candidate["type"], "parsed", candidate
            except ValueError:
                return fallback
    # An explicit completion verb does not change a course-only expression.
    text = re.sub(r"^(?:Completion of|Completed|Must complete|Students must complete)\s+", "", text, flags=re.IGNORECASE)
    read_all = re.fullmatch(r"To read all\s+(\d+):\s*(.+)", text, flags=re.IGNORECASE)
    if read_all:
        text = read_all.group(2)
        if len(course_codes(text)) != int(read_all.group(1)):
            return fallback
    lexer = re.compile(r"\s*([A-Z]{2,6}[0-9]{3}[A-Za-z0-9]*\b|either\b|and\b|or\b|[&(),])", re.IGNORECASE)
    tokens: list[str] = []
    offset = 0
    while offset < len(text):
        match = lexer.match(text, offset)
        if match is None or len(tokens) >= 256:
            return fallback
        tokens.append(match.group(1).upper())
        offset = match.end()
    position = 0

    def atom(depth: int) -> tuple[dict[str, Any], bool]:
        nonlocal position
        if depth > 8 or position >= len(tokens):
            raise ValueError("Missing or deeply nested course expression")
        token = tokens[position]
        position += 1
        if token == "(":
            node = alternatives(depth + 1)
            if position >= len(tokens) or tokens[position] != ")":
                raise ValueError("Unclosed prerequisite group")
            position += 1
            return node, True
        if token == "EITHER":
            node = alternatives(depth + 1)
            if node["type"] != "any":
                raise ValueError("Either requires alternatives")
            return node, True
        if COURSE_CODE_IN_TEXT_RE.fullmatch(token):
            return {"type": "course", "courseCode": token}, False
        raise ValueError("Expected course or parenthesized expression")

    def conjunction(depth: int) -> tuple[dict[str, Any], bool, bool]:
        nonlocal position
        first, wrapped = atom(depth)
        children = [first]
        while position < len(tokens) and tokens[position] in {"AND", "&", ","}:
            connector = tokens[position]
            position += 1
            if connector == "," and position < len(tokens) and tokens[position] in {"AND", "&"}:
                position += 1
            elif connector == "," and position < len(tokens) and tokens[position] == "OR":
                break  # Oxford comma immediately before the OR alternative.
            children.append(atom(depth)[0])
        paired = len(children) > 1
        return ({"type": "all", "children": children} if paired else first), paired, wrapped and not paired

    def alternatives(depth: int) -> dict[str, Any]:
        nonlocal position
        groups = [conjunction(depth)]
        while position < len(tokens) and tokens[position] == "OR":
            position += 1
            groups.append(conjunction(depth))
        if len(groups) == 1:
            return groups[0][0]
        if any(paired and not wrapped for _, paired, wrapped in groups) and any(not paired and not wrapped for _, paired, wrapped in groups):
            raise ValueError("Unparenthesized AND/OR scope is ambiguous")
        return {"type": "any", "children": [node for node, _, _ in groups]}

    try:
        candidate = normalize_prerequisite_rule(alternatives(1))
        if position != len(tokens):
            return fallback
        return "single" if candidate["type"] == "course" else candidate["type"], "parsed", candidate
    except ValueError:
        return fallback


def normalize_prerequisite_rule(rule: dict[str, Any]) -> dict[str, Any]:
    nodes = 0
    def visit(node: dict[str, Any], depth: int = 1) -> dict[str, Any]:
        nonlocal nodes
        nodes += 1
        if depth > 8 or nodes > 64:
            raise ValueError("Prerequisite tree exceeds depth/node budget")
        if node["type"] in {"course", "condition"}:
            return node
        children = [visit(child, depth + 1) for child in node["children"]]
        if node["type"] in {"all", "any"}:
            children = [grandchild for child in children for grandchild in (child["children"] if child["type"] == node["type"] else [child])]
        children.sort(key=lambda child: json.dumps(child, sort_keys=True))
        signatures = [json.dumps(child, sort_keys=True) for child in children]
        if len(children) > 32 or len(signatures) != len(set(signatures)):
            raise ValueError("Repeated or oversized prerequisite choices")
        if node["type"] == "nOf":
            seen: set[str] = set()
            for child in children:
                leaves = set(prerequisite_rule_codes(child))
                if seen & leaves:
                    raise ValueError("Overlapping numbered course choices")
                seen.update(leaves)
            return {"type": "nOf", "count": node["count"], "children": children}
        return children[0] if len(children) == 1 else {"type": node["type"], "children": children}
    return visit(rule)


def prerequisite_condition_rule(text: str, depth: int = 1) -> dict[str, Any] | None:
    """Recognize complete, narrowly defined clauses without dropping qualifiers."""
    if depth > 8:
        return None
    def courses(value: str) -> dict[str, Any] | None:
        _, status, node = prerequisite_rule(value, course_codes(value), allow_conditions=False)
        return node if status == "parsed" else None
    def all_of(*nodes: dict[str, Any]) -> dict[str, Any]:
        children = [child for node in nodes for child in (node["children"] if node["type"] == "all" else [node])]
        return {"type": "all", "children": children}
    match = re.fullmatch(r"(MPCL only):\s*(.+?)\.?", text, flags=re.IGNORECASE)
    if match:
        base = courses(match.group(2))
        if base:
            return all_of({"type": "condition", "text": match.group(1)}, base)
    credit_prefix = r"(?:Completed|Complete(?:d)? (?:a )?minimum|Must complete)\s+\d+\s*cu(?: of courses)?"
    match = re.fullmatch(rf"({credit_prefix}),?\s+including\s+(.+)", text, flags=re.IGNORECASE)
    if match:
        tail = prerequisite_condition_rule(match.group(2), depth + 1) or courses(match.group(2))
        if tail:
            return all_of({"type": "condition", "text": match.group(1)}, tail)
    match = re.fullmatch(r"(.+?)\s+and\s+(ONE|TWO|\d+)\s*(?:\((\d+)\))?\s+of the following courses:\s*(.+)", text, flags=re.IGNORECASE)
    if match:
        count = {"ONE": 1, "TWO": 2}.get(match.group(2).upper(), int(match.group(2)) if match.group(2).isdigit() else 0)
        base, choices = courses(match.group(1)), courses(match.group(4))
        if base and choices and choices["type"] == "all" and (match.group(3) is None or int(match.group(3)) == count) and 1 <= count <= len(choices["children"]) and all(child["type"] == "course" for child in choices["children"]):
            if set(prerequisite_rule_codes(base)) & set(prerequisite_rule_codes(choices)):
                return None
            return all_of(base, {"type": "nOf", "count": count, "children": choices["children"]})
    match = re.fullmatch(rf"(.+?)\.\s*({credit_prefix})\.?", text, flags=re.IGNORECASE)
    if match:
        base = courses(match.group(1))
        if base:
            return all_of(base, {"type": "condition", "text": match.group(2)})
    match = re.fullmatch(r"(All Compulsory SWK Level 100,\s*200 courses)\s*(?:,\s*|and\s+)(.+?)\.?", text, flags=re.IGNORECASE)
    if match:
        base = courses(match.group(2))
        if base:
            return all_of({"type": "condition", "text": match.group(1)}, base)
    match = re.fullmatch(r"(All MCOU compulsory courses),\s*(.+?),\s*and\s+(CGPA of \d+(?:\.\d+)?)\.?", text, flags=re.IGNORECASE)
    if match:
        base = courses(match.group(2))
        if base:
            return all_of({"type": "condition", "text": match.group(1)}, base, {"type": "condition", "text": match.group(3)})
    # Keep the whole non-course alternative as one condition. Date, exemption,
    # concurrence and scope clauses are intentionally outside this grammar.
    parts = re.split(r"\s+or\s+", text.rstrip("."), flags=re.IGNORECASE)
    if len(parts) > 1:
        nodes: list[dict[str, Any]] = []
        saw_condition = False
        for part in parts:
            node = courses(part)
            if node is None and re.fullmatch(r"(?:(?:other )?prior learning in [A-Za-z /-]+|Malay Placement test)", part, flags=re.IGNORECASE) and not course_codes(part):
                node = {"type": "condition", "text": part}
                saw_condition = True
            if node is None:
                return None
            nodes.append(node)
        if saw_condition:
            return {"type": "any", "children": nodes}
    return None


def prerequisite_review_reason(text: str) -> str:
    if re.search(r"co[ -]*requisite|concurrent|at the same time", text, flags=re.IGNORECASE):
        return "Concurrent or co-requisite enrolment retained as remarks; no prerequisite edges suggested"
    if re.search(r"before|after|onwards|intakes?|Jul(?:y)? 20|Jan(?:uary)? 20", text, flags=re.IGNORECASE) and re.search(r"20\d{2}", text):
        return "Date or cohort-specific requirement retained in remarks; no default cohort selected"
    if re.search(r"compulsory|MPCL only|tracks?|programme|disciplines?", text, flags=re.IGNORECASE):
        return "Programme or course-group requirement retained in remarks; course membership is not inferred"
    if re.search(r"\bcu\b|\bcus\b|\d+\s*cu|CGPA|grade", text, flags=re.IGNORECASE):
        return "Credit or academic-standing requirement retained as prerequisite remarks"
    if re.search(r"\band\b|\bor\b|/", text, flags=re.IGNORECASE) and course_codes(text):
        return "Logical grouping needs triage; complete source wording retained"
    return "Non-course eligibility or unsupported wording retained as prerequisite remarks"


def analyze_prerequisite_remarks(value: str | None, target: str, *, has_prerequisite: bool = False) -> list[dict[str, Any]]:
    """Classify clauses by their enrolment meaning, not just course-code presence.

    Informational and recommended clauses stay in the audit/source cells. Only
    actual requirements, qualifications of an existing prerequisite, and unclear
    possible requirements enter prerequisite triage. No classifier adds edges.
    """
    clauses = [part.strip() for part in re.split(r"(?<=[.!?。])\s+|;\s*", normalize_prerequisite_text(value or "")) if part.strip(" .")]
    result = []
    for text in clauses:
        def matches(pattern: str) -> bool:
            return re.search(pattern, text, re.I) is not None

        disposition, category, reason = "information", "course_information", "No enrolment precondition identified"
        soft = matches(r"\b(?:recommend\w*|suggest\w*|advis\w*|encourag\w*|preferably|strongly urged)\b")
        concurrency = matches(r"co[ -]*requisite|concurrent|same semester|\b(?:take|taken)\b.{0,150}\btogether\b|\bto take (?:this )?with\b")
        entry_context = matches(r"\bto be eligible\b|\bin order to (?:take|read|enrol)\b|\bbefore (?:taking|reading|enrolling)\b|\bplacement (?:\w+ )?test\b")
        independent_must = matches(r"\b(?:students|applicants|they|you) (?:also )?must\b")
        if soft and not independent_must:
            disposition, category, reason = "recommendation", "recommendation", "Suggested preparation or scheduling is optional"
        elif matches(r"credit recognition|\bfor CR\b|\bfor (?:the )?(?:issuance|award) of (?:the )?certificate\b|\bfor graduation\b|\bUCore requirement\b"):
            category, reason = "credit_or_award", "Condition for credits, graduation or an award, rather than entry to this course"
        elif matches(r"excluded combination") or (matches(r"\b(?:not eligible|not (?:be )?applicable)\b") and matches(r"\bcompleted\b")):
            category, reason = "exclusion", "Exclusion or exclusion waiver; completing the named course is not a prerequisite"
        elif matches(r"\bis a pre[ -]*requisite for\b") and target not in course_codes(re.split(r"\bfor\b", text, flags=re.I)[-1]):
            category, reason = "other_course_requirement", "Describes a prerequisite for another course"
        elif matches(r"exempt") and not matches(r"pre[ -]*requisite|placement|prior learning"):
            category, reason = "course_exemption", "Exemption from the current course, rather than its entry requirements"
        elif matches(r"\b(?:must take|required to take|compulsory (?:course )?for|remains as a compulsory course|to take in (?:first|final)|to take (?:this course |this )?before|to be taken before)\b") and not entry_context and not matches(r"pre[ -]*requisite|\bto take after\b"):
            category, reason = "study_plan", "Programme obligation or study schedule, rather than prerequisites of this course"
        elif entry_context and matches(r"\b(?:must take|required to take)\b"):
            disposition, category, reason = "requirement", "eligibility", "Mandatory entry or placement-test requirement"
        elif matches(r"\bto take after\b|\bpre[ -]*requisites?\b|\b(?:must|need to|required to|would be required to)\s+(?:have\s+)?(?:taken|passed|completed|complete|pass|read|sit for)\b|\bmust have taken and passed\b|先修|修满"):
            disposition, category, reason = "requirement", "course_order", "Explicit prerequisite or completion requirement"
        elif matches(r"\b(?:should have completed|should have taken|should sit for)\b"):
            tail = re.split(r"\bbefore (?:taking|reading|sitting for)\b", text, flags=re.I)[-1]
            if "before" in text.lower() and course_codes(tail) and target not in course_codes(tail):
                category, reason = "other_course_requirement", "Study order refers to another course"
            else:
                disposition, category, reason = "needs_review", "possible_requirement", "Expected completion is stated without an explicit mandatory instruction"
        elif matches(r"\b(?:requires?|need)\b.{0,35}\b(?:foundation|background|knowledge|experience)\b|\b(?:background|experience)\b.{0,25}\b(?:mandatory|required)\b|\bminimum\b.{0,40}\bproficiency\b|\b(?:must|are required to) have\b.{0,40}\b(?:degree|qualifications?|training|access)\b|\bmust (?:achieve|obtain)\b|\bprior approval\b|\bmust contact\b.{0,60}\b(?:HoP|Head)\b|\bapplicants must\b"):
            disposition, category, reason = "requirement", "eligibility", "Explicit background, qualification, access or approval requirement"
        elif matches(r"\b(?:available only|only applicable|not open to|not offered to)\b|\bexclusion:|\boffered\b.{0,80}\bonly\b"):
            disposition, category, reason = "requirement", "eligibility", "Entry is restricted to specified students or programmes"
        elif concurrency:
            mentioned = set(course_codes(text)) - {target}
            if matches(r"\b(?:can|may)\b"):
                disposition = "qualification" if has_prerequisite and mentioned else "information"
                category, reason = "optional_concurrent", "Permitted concurrent enrolment; this is not a prior-completion requirement"
            else:
                disposition, category, reason = "requirement", "concurrent_enrolment", "Required concurrent enrolment, without prior-completion edges"
        elif matches(r"\b(?:knowledge|background)\b.{0,80}\bassumed\b"):
            disposition, category, reason = "needs_review", "assumed_knowledge", "Assumed knowledge may qualify preparation; it does not establish completion of a named course"
        elif matches(r"expected to have prior experience|should have a ready|\bshould have\b.{0,40}\bknowledge\b|\bprior learning\b"):
            disposition, category, reason = "needs_review", "possible_requirement", "Possible entry condition needs triage"
        elif has_prerequisite and matches(r"only applies|exempt|\b20\d{2}\b|intakes?|最后一个学期") and (course_codes(text) or matches(r"pre[ -]*requisite|exempt|最后一个学期")):
            disposition, category, reason = "qualification", "prerequisite_qualification", "Programme, intake or exemption qualifies the existing prerequisite"
        # A recommendation and a separate mandatory statement in one sentence
        # must be reviewed together, never discarded or reduced to the advice.
        if soft and independent_must:
            disposition, category, reason = "needs_review", "possible_requirement", "Mandatory and recommended clauses share a sentence; retain it for triage"
        categories = [category]
        if concurrency and disposition in {"requirement", "qualification", "needs_review"} and category not in {"concurrent_enrolment", "optional_concurrent"}:
            categories.append("concurrent_enrolment")
        if disposition in {"requirement", "qualification", "needs_review"} and matches(r"\b20\d{2}\b|intakes?"):
            categories.append("dated_or_cohort")
        result.append({"text": text, "disposition": disposition, "categories": categories, "reason": reason})
    return result


def prerequisite_remarks_categories(value: str | None) -> list[str]:
    return list(dict.fromkeys(category for clause in analyze_prerequisite_remarks(value, "") for category in clause["categories"]))


def prerequisite_remarks_rule(text: str, target: str) -> dict[str, Any] | None:
    """Parse complete, explicit completion clauses, retaining their qualifications."""
    # Each remaining sentence must be consumed. Information/recommendations have
    # already been classified separately; an unsupported requirement stops this
    # grammar rather than losing the second sentence or an alternative route.
    nodes, scopes = [], []
    for clause in re.split(r"(?<=[.])\s+", text):
        match = re.fullmatch(r"(?:(?P<scope>[A-Za-z][A-Za-z -]* students):\s*)?To take after(?: completing)?\s+(?P<courses>.+?)\.?", clause, re.I)
        if match:
            scope = match.group("scope")
            expression = match.group("courses")
        else:
            match = re.fullmatch(rf"(?:Students )?must (?:have completed|have passed|have taken and passed|complete|pass) (.+?)(?: first| before (?:taking|reading) (?:this course|{re.escape(target)}))?\.?", clause, re.I)
            if not match:
                break
            scope, expression = None, match.group(1)
        _, status, node = prerequisite_rule(expression, course_codes(expression), allow_conditions=False)
        if status != "parsed":
            break
        nodes.append(node)
        if scope:
            scopes.append(scope)
    else:
        if nodes:
            # Different scopes cannot be merged into a universal AND.
            if scopes and (len(set(scopes)) != 1 or len(scopes) != len(nodes)):
                return None
            try:
                node = normalize_prerequisite_rule(nodes[0] if len(nodes) == 1 else {"type": "all", "children": nodes})
            except ValueError:
                return None
            if scopes:
                node["displayRemarks"] = [text]
            return node
    # These routes explicitly distinguish passed courses from passed/concurrent
    # choices. The latter remain text conditions and never produce prior edges.
    match = re.fullmatch(rf"To take {re.escape(target)}, Forensic Psychology students must (.+?)\. Organisational Psychology students must (.+?)\.?", text, re.I)
    if match:
        routes = []
        for label, clause in zip(["Forensic Psychology students", "Organisational Psychology students"], match.groups()):
            parts = re.fullmatch(r"pass (.+?), and pass/concurrently take (.+)", clause, re.I)
            if not parts:
                return None
            _, status, passed = prerequisite_rule(parts.group(1), course_codes(parts.group(1)), allow_conditions=False)
            if status != "parsed":
                return None
            routes.append({"type": "all", "children": [{"type": "condition", "text": label}, passed, {"type": "condition", "text": "Passed or concurrently taking " + parts.group(2).rstrip(".")}]})
        return normalize_prerequisite_rule({"type": "any", "children": routes})
    return None


def attach_prerequisite_candidate(entry: dict[str, Any]) -> None:
    if entry.get("recordType") != "offering":
        return
    for field in ["prerequisiteEvidenceText", "prerequisiteNormalizedText", "prerequisiteNotes", "prerequisiteDiagnostics", "parserRule", "parserOperator", "parseStatus"]:
        entry.pop(field, None)
    raw_text = entry.get("prerequisite")
    remarks = entry.get("remarks")
    target = normalized_course_code(entry["courseCode"])
    analysis = analyze_prerequisite_remarks(remarks, target, has_prerequisite=bool(raw_text))
    for clause in analysis:
        if clause["disposition"] == "qualification" and "optional_concurrent" in clause["categories"] and not set(course_codes(clause["text"])) & set(course_codes(raw_text)):
            clause.update({"disposition": "information", "reason": "Optional pairing with another course does not qualify a listed prerequisite"})
    relevant = [clause for clause in analysis if clause["disposition"] in {"requirement", "qualification", "needs_review"}]
    categories = list(dict.fromkeys(category for clause in analysis for category in clause["categories"]))
    fields = (["prerequisite"] if raw_text else []) + (["remarks"] if remarks and (raw_text or relevant) else [])
    entry.update({"parserContractVersion": PARSER_CONTRACT_VERSION, "prerequisiteSourceFields": fields, "prerequisiteRemarksCategories": categories, "prerequisiteRemarksAnalysis": analysis})
    if not fields:
        return
    points_to_remarks = re.search(r"(?:see|refer to)\s+(?:the\s+)?remarks\b", raw_text or "", flags=re.IGNORECASE) is not None
    only_pointer = re.fullmatch(r"(?:please\s+)?(?:see|refer to)\s+(?:the\s+)?remarks[.!]?", clean(raw_text), flags=re.IGNORECASE) is not None
    relevant_text = " ".join(clause["text"] for clause in relevant)
    # Explicit pointers also support bare course lists without requirement verbs.
    resolved = (relevant_text or remarks) if (not raw_text or only_pointer) and remarks else raw_text
    evidence = "\n".join(([raw_text] if raw_text else []) + ([f"Remarks: {remarks}"] if "remarks" in fields else []))
    normalized = normalize_prerequisite_text(resolved)
    codes = course_codes(normalized)
    operator, status, candidate = prerequisite_rule(normalized, codes)
    raw_codes = [match.group(0).upper() for match in COURSE_CODE_IN_TEXT_RE.finditer(normalized)]
    diagnostics = []
    notes = []
    if "remarks" in fields:
        notes.append("Every remarks cell was checked; complete remarks are bound to this source evidence")
    if categories:
        notes.append("Remarks classification: " + "; ".join(category.replace("_", " ") for category in categories))
    if not raw_text:
        notes.append("Requirement found in remarks although the prerequisite cell is empty")
    if (not raw_text or only_pointer) and remarks:
        if not relevant and any(clause["disposition"] == "recommendation" for clause in analysis):
            status, candidate = "review_required", None
            diagnostics.append("Recommended preparation retained as remarks; recommendations do not create required prerequisite edges")
        elif candidate is None:
            candidate = prerequisite_remarks_rule(normalized, normalized_course_code(entry["courseCode"]))
            if candidate:
                status, operator = "parsed", "single" if candidate["type"] == "course" else candidate["type"]
                notes.append("Explicit completion requirements parsed from remarks; programme and concurrent conditions retained")
    elif candidate is not None and relevant:
        normalized_remarks = relevant_text
        if any("dated_or_cohort" in clause["categories"] for clause in relevant) and set(course_codes(normalized_remarks)) & set(prerequisite_rule_codes(candidate)):
            status, candidate = "review_required", None
            diagnostics.append("Remarks restrict a listed prerequisite by cohort or date; complete source retained without an unrestricted completion tree")
        elif re.search(r"co[ -]*requisite|concurrent|same semester|\btogether\b", normalized_remarks, re.I) and set(course_codes(normalized_remarks)) & set(prerequisite_rule_codes(candidate)):
            status, candidate = "review_required", None
            diagnostics.append("Remarks allow a listed prerequisite to be taken concurrently; complete source retained without prior-completion edges")
        elif re.search(r"\b(?:must|need to|required to|to take after)\b", normalized_remarks, re.I) and set(course_codes(normalized_remarks)) - {target} - set(prerequisite_rule_codes(candidate)):
            status, candidate = "review_required", None
            diagnostics.append("Additional course requirement in remarks needs triage; complete source retained")
        else:
            candidate["displayRemarks"] = list(dict.fromkeys([*candidate.get("displayRemarks", []), relevant_text]))
            notes.append("Only requirement-related clauses appear beneath the tree; optional advice and course information remain in source details and the audit")
    if points_to_remarks and not remarks:
        status, candidate = "review_required", None
        diagnostics.append("Prerequisite refers to an empty remarks cell; source check required")
    elif points_to_remarks:
        notes.append("Prerequisite evidence includes the remarks cell from the same source row")
    if normalized != clean(resolved):
        notes.append("PDF spacing repaired for parsing; original wording retained in source evidence")
    def has_condition(node: dict[str, Any]) -> bool:
        return node["type"] == "condition" or any(has_condition(child) for child in node.get("children", []))
    if candidate is not None and has_condition(candidate):
        notes.append("Text conditions remain part of the requirement; no course-group membership or eligibility result is inferred")
    if re.search(r"\beither\b", normalized, flags=re.IGNORECASE):
        diagnostics.append("Either grouping requires triage; ANL303 scope must be confirmed" if normalized.startswith("ANL303 and either ") else "Either grouping requires triage before publication")
    if candidate is None and len(raw_codes) != len(set(raw_codes)):
        diagnostics.append("Repeated raw course tokens require review")
    if candidate is not None and normalized_course_code(entry["courseCode"]) in prerequisite_rule_codes(candidate):
        status, candidate = "review_required", None
        diagnostics.append("Self-reference requires review; no prerequisite edges suggested")
    if candidate is None:
        diagnostics.append(prerequisite_review_reason(evidence))
    if re.search(r"\(cid:\d+\)", evidence, flags=re.IGNORECASE):
        diagnostics.append("Unresolved prerequisite glyph affects interpretation")
        status, candidate = "review_required", None
    entry.update({
        "parserContractVersion": PARSER_CONTRACT_VERSION,
        "parseStatus": status,
        "parserRule": candidate,
        "parserOperator": operator,
        "prerequisiteDiagnostics": diagnostics,
        "prerequisiteEvidenceText": evidence,
        "prerequisiteNormalizedText": normalized,
        "prerequisiteNotes": notes,
    })


def prerequisite_rule_codes(rule: dict[str, Any] | None) -> list[str]:
    if rule is None:
        return []
    if rule["type"] == "course":
        return [rule["courseCode"]]
    if rule["type"] == "condition":
        return []
    return list(dict.fromkeys(code for child in rule.get("children", []) for code in prerequisite_rule_codes(child)))


def active_replacement_pairs(current_course_code: str, remarks: str | None) -> list[tuple[str, str]]:
    if not remarks:
        return []
    pairs: list[tuple[str, str]] = []
    for sentence in re.split(r"(?<=[.])\s+", remarks):
        match = re.search(r"(.+?)\b(?:replaces?|replacing)\b(.+)", sentence, flags=re.IGNORECASE)
        if not match:
            continue
        new_codes = course_codes(match.group(1)) or [current_course_code]
        old_codes = course_codes(match.group(2))
        for old_code in old_codes:
            for new_code in new_codes:
                if old_code != new_code:
                    pairs.append((old_code, new_code))
    return list(dict.fromkeys(pairs))


def build_product_models(
    plans: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    issues: list[dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    product_plans = [
        {
            "planKey": plan["planKey"],
            "programmeName": plan["programmeName"],
            "programmeCode": None,
            "category": plan["category"],
            "studyMode": plan["studyMode"],
            "curriculumVersion": None,
            "effectiveFrom": None,
            "totalCreditUnits": None,
            "sourcePath": plan["sourcePath"],
            "sourceHash": plan["sourceHash"],
        }
        for plan in plans
    ]

    requirements: list[dict[str, Any]] = []
    requirement_by_section: dict[tuple[str, str], dict[str, Any]] = {}
    requirement_count_by_plan: dict[str, int] = {}
    plan_courses: list[dict[str, Any]] = []
    prerequisite_rules: list[dict[str, Any]] = []
    prerequisites: list[dict[str, Any]] = []
    exclusions: list[dict[str, Any]] = []
    presentations_by_key: dict[tuple[str, str, int, str], dict[str, Any]] = {}
    lifecycle_events: list[dict[str, Any]] = []
    replacements_by_key: dict[tuple[str, str, str, int | None, str | None], dict[str, Any]] = {}
    course_count_by_requirement: dict[str, int] = {}
    duplicate_plan_course_counts: dict[str, int] = {}

    for entry in entries:
        plan_key_value = entry["planKey"]
        course_code = clean(entry["courseCode"])
        record_type = entry["recordType"]
        effective_year, effective_period = parse_effective_term(entry.get("effectiveFromSemester"))

        if record_type == "historical":
            status = clean(entry.get("status")).lower()
            if status in {"retired", "replaced"}:
                lifecycle_key = ":".join(filter(None, (
                    plan_key_value,
                    course_code.lower(),
                    status,
                    str(effective_year or "unknown"),
                    (effective_period or "unknown").lower(),
                )))
                lifecycle_events.append({
                    "lifecycleEventKey": lifecycle_key,
                    "planKey": plan_key_value,
                    "courseCode": course_code,
                    "sourceCourseTitle": entry["courseTitle"],
                    "status": status,
                    "effectiveYear": effective_year,
                    "effectivePeriod": effective_period,
                    "rawEffectiveTerm": entry.get("effectiveFromSemester"),
                    "rawRemarks": entry.get("remarks"),
                })
                if status == "replaced":
                    for replacement_code in course_codes(entry.get("remarks")):
                        if replacement_code == course_code:
                            continue
                        key = (plan_key_value, course_code, replacement_code, effective_year, effective_period)
                        replacements_by_key[key] = {
                            "replacementKey": ":".join((
                                plan_key_value,
                                course_code.lower(),
                                replacement_code.lower(),
                                str(effective_year or "unknown"),
                                (effective_period or "unknown").lower(),
                            )),
                            "planKey": plan_key_value,
                            "oldCourseCode": course_code,
                            "newCourseCode": replacement_code,
                            "effectiveYear": effective_year,
                            "effectivePeriod": effective_period,
                            "rawText": entry.get("remarks"),
                        }
            continue

        section = clean(entry.get("section")) or "Unsectioned courses"
        section_key = (plan_key_value, section)
        requirement = requirement_by_section.get(section_key)
        if requirement is None:
            sort_order = requirement_count_by_plan.get(plan_key_value, 0) + 1
            requirement_count_by_plan[plan_key_value] = sort_order
            minimum_credit_units, maximum_credit_units = parse_credit_unit_range(section)
            required_course_count = parse_required_course_count(section)
            kind = requirement_type(section)
            requirement = {
                "requirementKey": f"{plan_key_value}:requirement:{sort_order}",
                "planKey": plan_key_value,
                "parentRequirementKey": None,
                "name": requirement_name(section),
                "requirementType": kind,
                "minimumCreditUnits": minimum_credit_units,
                "maximumCreditUnits": maximum_credit_units,
                "requiredCourseCount": required_course_count,
                "selectionRule": requirement_selection_rule(
                    section,
                    kind,
                    minimum_credit_units,
                    maximum_credit_units,
                    required_course_count,
                ),
                "ruleText": section,
                "sortOrder": sort_order,
            }
            requirement_by_section[section_key] = requirement
            requirements.append(requirement)

        requirement_key = requirement["requirementKey"]
        course_sort_order = course_count_by_requirement.get(requirement_key, 0) + 1
        course_count_by_requirement[requirement_key] = course_sort_order
        base_plan_course_key = f"{requirement_key}:{course_code.lower()}"
        duplicate_count = duplicate_plan_course_counts.get(base_plan_course_key, 0) + 1
        duplicate_plan_course_counts[base_plan_course_key] = duplicate_count
        plan_course_key = base_plan_course_key if duplicate_count == 1 else f"{base_plan_course_key}:{duplicate_count}"
        plan_courses.append({
            "planCourseKey": plan_course_key,
            "planKey": plan_key_value,
            "requirementKey": requirement_key,
            "courseCode": course_code,
            "sourceCourseTitle": entry["courseTitle"],
            "sourceCreditUnits": entry.get("creditUnits"),
            "status": "active",
            "sortOrder": course_sort_order,
        })

        attach_prerequisite_candidate(entry)
        evidence = entry.get("prerequisiteEvidenceText")
        if evidence:
            operator = entry["parserOperator"]
            parse_status = entry["parseStatus"]
            rule_json = entry["parserRule"]
            if issues is not None and parse_status != "parsed":
                message = "; ".join(entry["prerequisiteDiagnostics"]) + f" ({parse_status}): {evidence}"
                issues.append({
                    "planKey": plan_key_value,
                    "courseCode": course_code,
                    "sourcePage": entry.get("sourcePage", ""),
                    "severity": "warning",
                    "issue": message,
                })
            rule_key = f"{plan_course_key}:prerequisite"
            prerequisite_rules.append({
                "ruleKey": rule_key,
                "planKey": plan_key_value,
                "courseCode": course_code,
                "operator": operator,
                "rawText": entry["prerequisiteEvidenceText"],
                "rule": rule_json,
                "parseStatus": parse_status,
            })
            prerequisites.extend({
                "ruleKey": rule_key,
                "prerequisiteCourseCode": prerequisite_code,
                "sortOrder": index,
            } for index, prerequisite_code in enumerate(prerequisite_rule_codes(rule_json), start=1))

        raw_exclusion = entry.get("excludedCombination")
        for excluded_code in course_codes(raw_exclusion):
            if excluded_code == course_code:
                continue
            exclusions.append({
                "planKey": plan_key_value,
                "courseCode": course_code,
                "excludedCourseCode": excluded_code,
                "rawText": raw_exclusion,
            })

        for presentation in entry.get("presentations", []):
            key = (plan_key_value, course_code, int(presentation["year"]), presentation["term"])
            presentations_by_key[key] = {
                "planKey": plan_key_value,
                "courseCode": course_code,
                "presentationYear": int(presentation["year"]),
                "presentationPeriod": presentation["term"],
                "status": presentation["status"],
            }

        remarks = entry.get("remarks")
        if effective_year is None:
            effective_year, effective_period = parse_effective_term(remarks)
        for old_course_code, new_course_code in active_replacement_pairs(course_code, remarks):
            key = (plan_key_value, old_course_code, new_course_code, effective_year, effective_period)
            replacements_by_key[key] = {
                "replacementKey": ":".join((
                    plan_key_value,
                    old_course_code.lower(),
                    new_course_code.lower(),
                    str(effective_year or "unknown"),
                    (effective_period or "unknown").lower(),
                )),
                "planKey": plan_key_value,
                "oldCourseCode": old_course_code,
                "newCourseCode": new_course_code,
                "effectiveYear": effective_year,
                "effectivePeriod": effective_period,
                "rawText": remarks,
            }

    return {
        "plans": product_plans,
        "requirements": requirements,
        "planCourses": plan_courses,
        "prerequisiteRules": prerequisite_rules,
        "prerequisites": prerequisites,
        "exclusions": exclusions,
        "presentations": list(presentations_by_key.values()),
        "lifecycleEvents": lifecycle_events,
        "replacements": list(replacements_by_key.values()),
    }


def sql_string(value: object) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value: object) -> str:
    return f"{sql_string(json.dumps(value, ensure_ascii=False))}::jsonb"


def sql_number(value: object) -> str:
    return "NULL" if value is None else str(value)


def validate_prerequisites(models: dict[str, list[dict[str, Any]]]) -> None:
    rules = {rule["ruleKey"]: rule for rule in models["prerequisiteRules"]}
    for rule in rules.values():
        for code in prerequisite_rule_codes(rule["rule"]):
            if normalized_course_code(code) == normalized_course_code(rule["courseCode"]):
                raise ValueError(f"Self-prerequisite in rule {rule['ruleKey']}: {code}")
    for prerequisite in models["prerequisites"]:
        rule = rules.get(prerequisite["ruleKey"])
        if rule is None:
            raise ValueError(f"Unknown prerequisite rule: {prerequisite['ruleKey']}")
        code = prerequisite["prerequisiteCourseCode"]
        if normalized_course_code(code) == normalized_course_code(rule["courseCode"]):
            raise ValueError(f"Self-prerequisite in rule {rule['ruleKey']}: {code}")


def generate_sql(models: dict[str, list[dict[str, Any]]]) -> str:
    validate_prerequisites(models)
    plan_keys = [plan["planKey"] for plan in models["plans"]]
    plan_key_list = ", ".join(sql_string(value) for value in plan_keys)
    lines = [
        "-- EXPERIMENTAL ONLY: never use this import for reviewed prerequisite records.",
        "-- Curriculum plan import generated by parse_curriculum_plans.py.",
        "-- Requires the optional tables in scraper/curriculum-schema-extension.sql.",
        "-- The extension is preliminary and is not part of the deployed application schema.",
        "-- Review the JSON and issues TSV before importing this file.",
        "BEGIN;",
        "DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'curriculum_prerequisite_rules' AND column_name = 'approved_rule_hash') THEN RAISE EXCEPTION 'Experimental importer cannot modify reviewed prerequisites. Use scripts/review-curriculum.ts.'; END IF; END $guard$;",
    ]

    for plan in models["plans"]:
        lines.append(
            "INSERT INTO curriculum_plans "
            "(plan_key, programme_name, programme_code, category, study_mode, curriculum_version, "
            "effective_from, total_credit_units, source_path, source_hash) VALUES ("
            f"{sql_string(plan['planKey'])}, {sql_string(plan['programmeName'])}, "
            f"{sql_string(plan['programmeCode'])}, {sql_string(plan['category'])}, {sql_string(plan['studyMode'])}, "
            f"{sql_string(plan['curriculumVersion'])}, {sql_string(plan['effectiveFrom'])}, "
            f"{sql_number(plan['totalCreditUnits'])}, {sql_string(plan['sourcePath'])}, {sql_string(plan['sourceHash'])}) "
            "ON CONFLICT (plan_key) DO UPDATE SET "
            "programme_name = EXCLUDED.programme_name, programme_code = EXCLUDED.programme_code, "
            "category = EXCLUDED.category, study_mode = EXCLUDED.study_mode, "
            "curriculum_version = EXCLUDED.curriculum_version, effective_from = EXCLUDED.effective_from, "
            "total_credit_units = EXCLUDED.total_credit_units, source_path = EXCLUDED.source_path, "
            "source_hash = EXCLUDED.source_hash, last_updated = now();"
        )

    if plan_keys:
        lines.extend([
            f"DELETE FROM curriculum_course_replacements WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_course_lifecycle_events WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_course_presentations WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_course_exclusions WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_prerequisite_rules WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_plan_courses WHERE plan_key IN ({plan_key_list});",
            f"DELETE FROM curriculum_requirements WHERE plan_key IN ({plan_key_list});",
        ])

    for requirement in models["requirements"]:
        lines.append(
            "INSERT INTO curriculum_requirements ("
            "requirement_key, plan_key, parent_requirement_key, name, requirement_type, minimum_credit_units, "
            "maximum_credit_units, required_course_count, selection_rule, rule_text, sort_order"
            ") VALUES ("
            f"{sql_string(requirement['requirementKey'])}, {sql_string(requirement['planKey'])}, "
            f"{sql_string(requirement['parentRequirementKey'])}, {sql_string(requirement['name'])}, "
            f"{sql_string(requirement['requirementType'])}, {sql_number(requirement['minimumCreditUnits'])}, "
            f"{sql_number(requirement['maximumCreditUnits'])}, {sql_number(requirement['requiredCourseCount'])}, "
            f"{sql_string(requirement['selectionRule'])}, {sql_string(requirement['ruleText'])}, "
            f"{requirement['sortOrder']});"
        )

    for course in models["planCourses"]:
        lines.append(
            "INSERT INTO curriculum_plan_courses ("
            "plan_course_key, plan_key, requirement_key, course_code, source_course_title, "
            "source_credit_units, status, sort_order"
            ") VALUES ("
            f"{sql_string(course['planCourseKey'])}, {sql_string(course['planKey'])}, "
            f"{sql_string(course['requirementKey'])}, {sql_string(course['courseCode'])}, "
            f"{sql_string(course['sourceCourseTitle'])}, {sql_number(course['sourceCreditUnits'])}, "
            f"{sql_string(course['status'])}, {course['sortOrder']});"
        )

    for rule in models["prerequisiteRules"]:
        lines.append(
            "INSERT INTO curriculum_prerequisite_rules ("
            "rule_key, plan_key, course_code, rule_operator, raw_text, rule_json, parse_status"
            ") VALUES ("
            f"{sql_string(rule['ruleKey'])}, {sql_string(rule['planKey'])}, {sql_string(rule['courseCode'])}, "
            f"{sql_string(rule['operator'])}, {sql_string(rule['rawText'])}, {sql_json(rule['rule'])}, "
            f"{sql_string(rule['parseStatus'])});"
        )

    for prerequisite in models["prerequisites"]:
        lines.append(
            "INSERT INTO curriculum_prerequisites (rule_key, prerequisite_course_code, sort_order) VALUES ("
            f"{sql_string(prerequisite['ruleKey'])}, {sql_string(prerequisite['prerequisiteCourseCode'])}, "
            f"{prerequisite['sortOrder']});"
        )

    for exclusion in models["exclusions"]:
        lines.append(
            "INSERT INTO curriculum_course_exclusions ("
            "plan_key, course_code, excluded_course_code, raw_text"
            ") VALUES ("
            f"{sql_string(exclusion['planKey'])}, {sql_string(exclusion['courseCode'])}, "
            f"{sql_string(exclusion['excludedCourseCode'])}, {sql_string(exclusion['rawText'])});"
        )

    for presentation in models["presentations"]:
        lines.append(
            "INSERT INTO curriculum_course_presentations ("
            "plan_key, course_code, presentation_year, presentation_period, status"
            ") VALUES ("
            f"{sql_string(presentation['planKey'])}, {sql_string(presentation['courseCode'])}, "
            f"{presentation['presentationYear']}, {sql_string(presentation['presentationPeriod'])}, "
            f"{sql_string(presentation['status'])});"
        )

    for event in models["lifecycleEvents"]:
        lines.append(
            "INSERT INTO curriculum_course_lifecycle_events ("
            "lifecycle_event_key, plan_key, course_code, source_course_title, status, effective_year, "
            "effective_period, raw_effective_term, raw_remarks"
            ") VALUES ("
            f"{sql_string(event['lifecycleEventKey'])}, {sql_string(event['planKey'])}, "
            f"{sql_string(event['courseCode'])}, {sql_string(event['sourceCourseTitle'])}, "
            f"{sql_string(event['status'])}, {sql_number(event['effectiveYear'])}, "
            f"{sql_string(event['effectivePeriod'])}, {sql_string(event['rawEffectiveTerm'])}, "
            f"{sql_string(event['rawRemarks'])});"
        )

    for replacement in models["replacements"]:
        lines.append(
            "INSERT INTO curriculum_course_replacements ("
            "replacement_key, plan_key, old_course_code, new_course_code, effective_year, "
            "effective_period, raw_text"
            ") VALUES ("
            f"{sql_string(replacement['replacementKey'])}, {sql_string(replacement['planKey'])}, "
            f"{sql_string(replacement['oldCourseCode'])}, {sql_string(replacement['newCourseCode'])}, "
            f"{sql_number(replacement['effectiveYear'])}, {sql_string(replacement['effectivePeriod'])}, "
            f"{sql_string(replacement['rawText'])});"
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
    parser = argparse.ArgumentParser(description="Parse SUSS curriculum-plan PDFs into product JSON and importable SQL.")
    parser.add_argument("--input-dir", type=Path, default=Path("data/input/curriculum-plans"))
    parser.add_argument("--json", type=Path, default=Path("data/output/curriculum/curriculum-plans.json"))
    parser.add_argument("--out", type=Path, default=Path("data/output/curriculum/curriculum-plans.sql"))
    parser.add_argument("--issues-out", type=Path, default=Path("data/output/curriculum/issues.tsv"))
    parser.add_argument("--format", choices=("json", "sql", "both"), default="both")
    parser.add_argument(
        "--ocr-on-cid",
        action="store_true",
        help="OCR unresolved title cells for every course prefix, not only automatic TLL entries",
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

    print("Tamil curriculum plans use selective English/Tamil title OCR automatically.")

    ocr_languages = parse_ocr_languages(args.ocr_languages)
    if not ocr_languages:
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
            ocr_on_cid=args.ocr_on_cid or "tamil" in pdf_path.stem.lower(),
            ocr_output_root=args.ocr_output_dir,
            ocr_languages=ocr_languages,
            ocr_course_prefixes=TAMIL_COURSE_PREFIXES,
        )
        plans.append(plan)
        entries.extend(plan_entries)
        issues.extend(plan_issues)

    models = build_product_models(plans, entries, issues)
    payload = {
        "metadata": {
            "parserContractVersion": PARSER_CONTRACT_VERSION,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sourceDirectory": args.input_dir.as_posix(),
            "planCount": len(plans),
            "entryCount": len(entries),
            "courseLikeRowCount": sum(plan["courseLikeRowCount"] for plan in plans),
            "issueCount": len(issues),
            "recordCounts": {key: len(value) for key, value in models.items()},
            "notes": [
                "Course rows remain programme-plan-specific and are not merged globally.",
                "Presentations describe published availability and do not create class schedules or semesters.",
                "Prerequisite rules preserve source text, parse explicit logical groups and flag ambiguous or non-course conditions for review.",
                "Every offering row's remarks are checked; related requirements, recommendations and qualifications are preserved with their source cells.",
                "Retired and replaced rows are lifecycle records and are not batch-added as active plan courses.",
                "CID OCR is limited to affected title cells and never overwrites source PDFs.",
            ],
        },
        **models,
        "review": {
            "plans": plans,
            "sourceEntries": entries,
            "issues": issues,
        },
    }

    if args.format in {"json", "both"}:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON written to: {args.json}")
    if args.format in {"sql", "both"}:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(generate_sql(models), encoding="utf-8")
        print(f"SQL written to: {args.out}")

    write_issues(args.issues_out, issues)
    print(f"Plans parsed: {len(plans)}")
    print(f"Curriculum entries parsed: {len(entries)}")
    print(f"Active plan courses: {len(models['planCourses'])}")
    print(f"Course presentations: {len(models['presentations'])}")
    print(f"Lifecycle events: {len(models['lifecycleEvents'])}")
    print(f"Issues: {len(issues)}")
    print(f"Issues written to: {args.issues_out}")


if __name__ == "__main__":
    main()
