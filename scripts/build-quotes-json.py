#!/usr/bin/env python3

import argparse
import json
import re
import sys
from pathlib import Path


DEFAULT_INPUT = Path("app/data/quotes.txt")
DEFAULT_OUTPUT = Path("app/quotes.json")
MIN_QUOTE_LENGTH = 40
MAX_QUOTE_LENGTH = 140
NEAR_DUPLICATE_THRESHOLD = 0.6


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build app/quotes.json from newline-separated quotes in app/data/quotes.txt."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Source text file. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Destination JSON file. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def normalize_quote(value):
    quote_without_attribution = value.split("—", 1)[0]
    normalized = re.sub(r"[^a-z0-9]+", " ", quote_without_attribution.lower())
    return re.sub(r"\s+", " ", normalized).strip()


def quote_words(value):
    return {word for word in normalize_quote(value).split() if len(word) > 2}


def read_quotes(input_path):
    if not input_path.exists():
        raise ValueError(f"{input_path} does not exist.")

    quotes = []
    blank_lines = []

    for line_number, line in enumerate(input_path.read_text(encoding="utf-8").splitlines(), start=1):
        quote = line.strip()
        if quote:
            quotes.append((line_number, quote))
        else:
            blank_lines.append(line_number)

    return quotes, blank_lines


def find_duplicate_groups(items, key_fn):
    seen = {}
    for line_number, quote in items:
        key = key_fn(quote)
        seen.setdefault(key, []).append((line_number, quote))

    return [group for group in seen.values() if len(group) > 1]


def find_near_duplicates(items):
    candidates = []
    word_sets = [(line_number, quote, quote_words(quote)) for line_number, quote in items]

    for left_index, (left_line, left_quote, left_words) in enumerate(word_sets):
        for right_line, right_quote, right_words in word_sets[left_index + 1:]:
            if not left_words or not right_words:
                continue

            union = left_words | right_words
            score = len(left_words & right_words) / len(union)

            if score >= NEAR_DUPLICATE_THRESHOLD:
                candidates.append((score, left_line, right_line, left_quote, right_quote))

    return sorted(candidates, reverse=True)


def validate_quotes(items):
    errors = []

    if not items:
        errors.append("No quotes were found.")

    for line_number, quote in items:
        if len(quote) < MIN_QUOTE_LENGTH:
            errors.append(f"Line {line_number} is shorter than {MIN_QUOTE_LENGTH} characters.")
        if len(quote) > MAX_QUOTE_LENGTH:
            errors.append(f"Line {line_number} is longer than {MAX_QUOTE_LENGTH} characters.")

    exact_duplicates = find_duplicate_groups(items, lambda quote: quote)
    for group in exact_duplicates:
        lines = ", ".join(str(line_number) for line_number, _ in group)
        errors.append(f"Exact duplicate quote on lines {lines}.")

    normalized_duplicates = find_duplicate_groups(items, normalize_quote)
    for group in normalized_duplicates:
        lines = ", ".join(str(line_number) for line_number, _ in group)
        errors.append(f"Normalized duplicate quote on lines {lines}.")

    near_duplicates = find_near_duplicates(items)
    for score, left_line, right_line, left_quote, right_quote in near_duplicates[:10]:
        errors.append(
            f"Near-duplicate candidate on lines {left_line} and {right_line} "
            f"(score {score:.2f}): {left_quote!r} / {right_quote!r}"
        )

    if len(near_duplicates) > 10:
        errors.append(f"{len(near_duplicates) - 10} additional near-duplicate candidates were omitted.")

    return errors


def build_json(items):
    return [
        {
            "id": index,
            "quote": quote,
        }
        for index, (_, quote) in enumerate(items, start=1)
    ]


def main():
    args = parse_args()

    try:
        quotes, blank_lines = read_quotes(args.input)
        errors = validate_quotes(quotes)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    if blank_lines:
        joined_lines = ", ".join(str(line_number) for line_number in blank_lines[:20])
        suffix = " ..." if len(blank_lines) > 20 else ""
        errors.append(f"Blank lines are not allowed. Found blank lines at: {joined_lines}{suffix}.")

    if errors:
        print("quotes.json was not written because validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(build_json(quotes), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} from {args.input} with {len(quotes)} quotes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
