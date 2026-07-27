from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Sequence


def parse_ocr_languages(value: str) -> list[str]:
    return [item.strip() for item in value.replace("+", ",").split(",") if item.strip()]


@lru_cache(maxsize=None)
def ensure_ocr_environment(languages: tuple[str, ...]) -> None:
    try:
        import ocrmypdf  # noqa: F401
    except ImportError as error:
        raise RuntimeError(
            "OCR setup error: OCRmyPDF is not installed. Run "
            "`pip install -r requirements-ocr.txt`."
        ) from error

    tesseract = shutil.which("tesseract")
    if tesseract is None:
        raise RuntimeError(
            "OCR setup error: Tesseract is not installed. On Ubuntu/WSL run "
            "`sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-tam`."
        )

    language_result = subprocess.run(
        [tesseract, "--list-langs"],
        check=True,
        capture_output=True,
        text=True,
    )
    available_languages = {
        line.strip()
        for line in language_result.stdout.splitlines()
        if line.strip() and not line.startswith("List of available languages")
    }
    missing_languages = sorted(set(languages) - available_languages)
    if missing_languages:
        packages = " ".join(f"tesseract-ocr-{language}" for language in missing_languages)
        raise RuntimeError(
            f"OCR setup error: missing Tesseract languages: {', '.join(missing_languages)}. "
            f"On Ubuntu/WSL run `sudo apt install {packages}`."
        )

    if "tam" in languages:
        font_config = shutil.which("fc-list")
        if font_config is None:
            raise RuntimeError(
                "OCR setup error: fontconfig is required to verify Tamil fonts. "
                "On Ubuntu/WSL run `sudo apt install fontconfig fonts-noto-core`."
            )

        font_result = subprocess.run(
            [font_config, ":family=Noto Sans Tamil", "file"],
            check=True,
            capture_output=True,
            text=True,
        )
        if not font_result.stdout.strip():
            raise RuntimeError(
                "OCR setup error: Noto Sans Tamil is not installed. On Ubuntu/WSL run "
                "`sudo apt install fonts-noto-core`, then rerun the scraper."
            )


def ocr_pdf_pages(
    input_pdf: Path,
    output_pdf: Path,
    *,
    pages: str,
    languages: list[str],
    sidecar_output: Path | None = None,
) -> None:
    ensure_ocr_environment(tuple(languages))
    import ocrmypdf

    input_pdf = input_pdf.expanduser().resolve()
    output_pdf = output_pdf.expanduser().resolve()
    if input_pdf == output_pdf:
        raise ValueError("OCR output must not overwrite the source PDF.")

    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    if sidecar_output is not None:
        sidecar_output = sidecar_output.expanduser().resolve()
        sidecar_output.parent.mkdir(parents=True, exist_ok=True)

    # OCRmyPDF will not write over an existing file. Render to a temporary sibling
    # and atomically replace our generated copy after OCR succeeds.
    with tempfile.TemporaryDirectory(prefix="ocr-", dir=output_pdf.parent) as temp_dir:
        temporary_output = Path(temp_dir) / output_pdf.name
        temporary_sidecar = Path(temp_dir) / "ocr-sidecar.txt" if sidecar_output is not None else None
        # FontTools reports harmless zero/Unix-epoch PDF font timestamps at warning
        # level. Keep actual errors while avoiding two noisy lines per course.
        logging.getLogger("fontTools.ttLib.tables._h_e_a_d").setLevel(logging.ERROR)
        original_stderr = sys.stderr
        try:
            ocrmypdf.ocr(
                input_pdf,
                temporary_output,
                language=languages,
                pages=pages,
                sidecar=temporary_sidecar,
                force_ocr=True,
                output_type="pdf",
                optimize=0,
                progress_bar=False,
            )
        finally:
            # OCRmyPDF configures process-wide logging and may replace stderr.
            # Restore it so callers receive validation and parsing errors.
            sys.stderr = original_stderr
        os.replace(temporary_output, output_pdf)
        if temporary_sidecar is not None and sidecar_output is not None:
            os.replace(temporary_sidecar, sidecar_output)


def ocr_pdf_region_text(
    input_pdf: Path,
    *,
    page_number: int,
    bbox: Sequence[float],
    languages: list[str],
    dpi: int = 400,
    page_segmentation_mode: int = 6,
) -> str:
    """OCR one PDF region without changing the source PDF.

    ``bbox`` uses pdfplumber's ``(x0, top, x1, bottom)`` PDF-point
    coordinates. Rendering and cropping the field first prevents adjacent
    table columns from being mixed into narrow multilingual cells.
    """
    ensure_ocr_environment(tuple(languages))
    if page_number < 1:
        raise ValueError("OCR page numbers start at 1.")
    if len(bbox) != 4:
        raise ValueError("OCR region must contain x0, top, x1, and bottom.")

    ghostscript = shutil.which("gs") or shutil.which("gswin64c")
    if ghostscript is None:
        raise RuntimeError(
            "OCR setup error: Ghostscript is not installed. On Ubuntu/WSL run "
            "`sudo apt install ghostscript`."
        )

    tesseract = shutil.which("tesseract")
    if tesseract is None:  # Also checked by ensure_ocr_environment; keeps typing simple.
        raise RuntimeError("OCR setup error: Tesseract is not installed.")

    from PIL import Image

    with tempfile.TemporaryDirectory(prefix="ocr-region-") as temp_dir:
        rendered_page = Path(temp_dir) / "page.png"
        cropped_region = Path(temp_dir) / "region.png"
        subprocess.run(
            [
                ghostscript,
                "-q",
                "-dSAFER",
                "-dBATCH",
                "-dNOPAUSE",
                "-sDEVICE=pnggray",
                f"-r{dpi}",
                f"-dFirstPage={page_number}",
                f"-dLastPage={page_number}",
                f"-sOutputFile={rendered_page}",
                str(input_pdf.expanduser().resolve()),
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        scale = dpi / 72
        crop_box = tuple(round(float(value) * scale) for value in bbox)
        with Image.open(rendered_page) as image:
            image.crop(crop_box).save(cropped_region)

        result = subprocess.run(
            [
                tesseract,
                str(cropped_region),
                "stdout",
                "-l",
                "+".join(languages),
                "--psm",
                str(page_segmentation_mode),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate OCRmyPDF, Tesseract, and OCR font dependencies.")
    parser.add_argument("--languages", default="eng,tam", help="Comma-separated Tesseract language codes")
    args = parser.parse_args()
    languages = parse_ocr_languages(args.languages)
    if not languages:
        raise ValueError("At least one OCR language is required.")
    ensure_ocr_environment(tuple(languages))
    print(f"OCR dependencies ready for: {', '.join(languages)}")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None
