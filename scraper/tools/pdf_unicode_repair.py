from __future__ import annotations

import re
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

try:
    from fontTools.ttLib import TTFont
    from pypdf import PdfReader
except ImportError as error:  # pragma: no cover - surfaced in CLI output instead.
    raise RuntimeError(
        "PDF Unicode repair requires `pypdf` and `fonttools`. Run `pip install -r requirements.txt`."
    ) from error

CID_TOKEN_RE = re.compile(r"\(?cid:(\d+)\)?", re.IGNORECASE)
CID_TOKEN_FULL_RE = re.compile(r"^\(?cid:(\d+)\)?$", re.IGNORECASE)
FONT_SUBSET_RE = re.compile(r"^[A-Z]{6}\+")


def normalize_font_name(value: object) -> str:
    name = str(value or "")
    if name.startswith("/"):
        name = name[1:]
    name = FONT_SUBSET_RE.sub("", name)
    return name.replace("#20", " ").strip()


def extract_cid_token(text: object) -> int | None:
    if not isinstance(text, str):
        return None

    match = CID_TOKEN_FULL_RE.fullmatch(text.strip())
    if not match:
        return None

    return int(match.group(1))


def has_cid_tokens(text: object) -> bool:
    return isinstance(text, str) and CID_TOKEN_RE.search(text) is not None


def repair_cid_tokens(text: str, cid_maps: list[dict[int, str]]) -> str:
    if not text or not cid_maps:
        return text

    def replace(match: re.Match[str]) -> str:
        cid = int(match.group(1))
        for cid_map in cid_maps:
            replacement = cid_map.get(cid)
            if replacement:
                return replacement
        return match.group(0)

    return CID_TOKEN_RE.sub(replace, text)


def _extract_font_bytes(font_obj: Any) -> bytes | None:
    descriptor = None
    subtype = str(font_obj.get("/Subtype") or "")

    if subtype == "/Type0":
        descendant_fonts = font_obj.get("/DescendantFonts") or []
        if not descendant_fonts:
            return None
        descendant = descendant_fonts[0].get_object()
        descriptor = descendant.get("/FontDescriptor")
    else:
        descriptor = font_obj.get("/FontDescriptor")

    if descriptor is None:
        return None

    descriptor_obj = descriptor.get_object()
    for key in ("/FontFile2", "/FontFile", "/FontFile3"):
        font_file = descriptor_obj.get(key)
        if font_file is not None:
            return font_file.get_data()

    return None


def _build_gid_to_char_map(font_bytes: bytes) -> dict[int, str]:
    try:
        font = TTFont(BytesIO(font_bytes), recalcBBoxes=False, recalcTimestamp=False)
    except Exception:
        return {}

    cmap = font.get("cmap")
    if cmap is None:
        return {}

    glyph_to_char: dict[str, str] = {}
    for table in cmap.tables:
        if not table.isUnicode():
            continue
        for codepoint, glyph_name in table.cmap.items():
            glyph_to_char.setdefault(glyph_name, chr(codepoint))

    gid_to_char: dict[int, str] = {}
    for gid, glyph_name in enumerate(font.getGlyphOrder()):
        char = glyph_to_char.get(glyph_name)
        if char:
            gid_to_char[gid] = char

    return gid_to_char


def _build_type0_cid_map(font_obj: Any) -> dict[int, str]:
    descendant_fonts = font_obj.get("/DescendantFonts") or []
    if not descendant_fonts:
        return {}

    descendant = descendant_fonts[0].get_object()
    font_bytes = _extract_font_bytes(font_obj)
    if font_bytes is None:
        return {}

    gid_to_char = _build_gid_to_char_map(font_bytes)
    if not gid_to_char:
        return {}

    cid_to_gid = descendant.get("/CIDToGIDMap")
    if cid_to_gid is None or str(cid_to_gid) == "/Identity":
        return gid_to_char

    if hasattr(cid_to_gid, "get_data"):
        data = cid_to_gid.get_data()
        if len(data) % 2 != 0:
            return gid_to_char

        cid_to_char: dict[int, str] = {}
        for offset in range(0, len(data), 2):
            gid = int.from_bytes(data[offset : offset + 2], "big")
            char = gid_to_char.get(gid)
            if char:
                cid_to_char[offset // 2] = char
        return cid_to_char

    return gid_to_char


def build_pdf_page_font_maps(pdf_path: Path) -> list[dict[str, dict[int, str]]]:
    reader = PdfReader(str(pdf_path))
    page_maps: list[dict[str, dict[int, str]]] = []

    for page in reader.pages:
        fonts_for_page: dict[str, dict[int, str]] = {}
        resources = page.get("/Resources")
        if resources is not None and hasattr(resources, "get_object"):
            resources = resources.get_object()

        fonts = (resources or {}).get("/Font") or {}
        if hasattr(fonts, "get_object"):
            fonts = fonts.get_object()

        for font_key, font_ref in fonts.items():
            font_obj = font_ref.get_object()
            font_name = normalize_font_name(font_obj.get("/BaseFont") or font_obj.get("/FontName") or font_key)
            if not font_name:
                continue

            subtype = str(font_obj.get("/Subtype") or "")
            cid_map: dict[int, str] = {}
            if subtype == "/Type0":
                cid_map = _build_type0_cid_map(font_obj)

            if cid_map:
                fonts_for_page[font_name] = cid_map

        page_maps.append(fonts_for_page)

    return page_maps


def font_priority_from_chars(chars: list[dict[str, Any]]) -> list[str]:
    counts: Counter[str] = Counter()
    for ch in chars:
        if extract_cid_token(ch.get("text")) is None:
            continue
        font_name = normalize_font_name(ch.get("fontname"))
        if font_name:
            counts[font_name] += 1

    return [font_name for font_name, _ in counts.most_common()]


def repair_chars(
    chars: list[dict[str, Any]],
    font_maps: dict[str, dict[int, str]],
) -> tuple[list[dict[str, Any]], int]:
    repaired_chars: list[dict[str, Any]] = []
    unresolved = 0

    for ch in chars:
        cid = extract_cid_token(ch.get("text"))
        if cid is not None:
            font_name = normalize_font_name(ch.get("fontname"))
            replacement = font_maps.get(font_name, {}).get(cid)
            if replacement:
                ch = dict(ch)
                ch["text"] = replacement
            else:
                unresolved += 1

        repaired_chars.append(ch)

    return repaired_chars, unresolved
