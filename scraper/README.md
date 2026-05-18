# SUSS Timetable Scraper

Local Node/TypeScript scraper for SUSS timetable PDFs and SUSS course synopsis PDFs. It generates SQL for Supabase/Postgres.

## Install

```bash
npm install
pip install -r requirements.txt
```

## 1. Scrape schedule PDFs

Put schedule PDFs in `data/input/schedules/`, edit `data/input/schedule-manifest.example.json`, then run:

```bash
npm run scrape:all -- \
  --manifest data/input/schedule-manifest.json \
  --out data/output/schedules-import.sql \
  --json data/output/schedules-parsed.json \
  --course-codes-out data/output/course-codes.txt
```

Import the generated SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules-import.sql
```

## 2. Download course synopsis PDFs

The SUSS course PDF endpoint has two variants:

- daytime: `isft=1`
- evening: `isft=0`

This command tries **both variants for every course code**. It only saves valid `%PDF` responses; HTML responses are treated as not found and are not saved.

```bash
npm run download:courses -- \
  --codes-file data/output/course-codes.txt \
  --out-dir data/input/course-pdfs \
  --report-out data/output/course-pdf-download-report.tsv \
  --manifest-out data/output/course-pdf-downloads.json
```

Output layout:

```text
data/input/course-pdfs/daytime/ICT101.pdf
data/input/course-pdfs/evening/ICT101.pdf
```

The report has 3 columns:

```text
course_code    daytime    evening
ICT101                    ✓
NCO212         ✓
```

Use `--force` to redownload existing PDFs.

## 3. Parse downloaded course PDFs

```bash
npm run parse:courses -- \
  --pdf-dir data/input/course-pdfs \
  --codes-file data/output/course-codes.txt \
  --out data/output/course-details-import.sql \
  --json data/output/course-details-parsed.json
```

This parses both:

```text
data/input/course-pdfs/daytime/*.pdf
data/input/course-pdfs/evening/*.pdf
```

It generates SQL for:

- `courses`
- `assessment_components`

Assessment components are latest-only but separated by `schedule_type`:

- `daytime`
- `evening`

Import:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/course-details-import.sql
```

## Assessment schema migration

If your database already has the older latest-only `assessment_components` table without `schedule_type`, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/update_assessment_components_schedule_type.sql
```

The migration aborts if `assessment_components` is not empty.

## Useful generated files

```text
data/output/course-pdf-download-report.tsv
data/output/course-pdf-downloads.json
data/output/course-details-parsed.json
data/output/course-details-import.sql
```


## Parser quality improvements in this build

The course PDF parser now treats the online course PDFs as semi-structured PDFs rather than clean text:

- uses `pdfplumber` text + table extraction
- reconstructs synopsis paragraphs by removing PDF line-wrap newlines
- reconstructs bullet lists for topics and learning outcomes by joining continuation lines
- groups textbook entries by `(Smart Guide)`, `(Recommended)`, etc. and captures ISBN where available
- parses assessment tables across page breaks and carries the OCAS/OES group forward
- skips assessment inserts when the parsed assessment total is not 100, instead of importing bad rows
- writes a review report to `data/output/course-parse-issues.tsv` by default

Recommended parse command:

```bash
npm run parse:courses -- \
  --pdf-dir data/input/course-pdfs \
  --codes-file data/output/course-codes.txt \
  --out data/output/course-details-import.sql \
  --json data/output/course-details-parsed.json \
  --issues-out data/output/course-parse-issues.tsv
```


## Latest parser notes

- `course_textbooks` has been removed from the schema and parser output. The SUSS PDF textbook section is too inconsistent to treat as reliable structured data for the planner MVP.
- Course PDFs that contain only `No Record Found` are skipped during parsing and written to the issues TSV instead of being added to `course-details-parsed.json` or SQL.
- If your database already has a `course_textbooks` column, run `migrations/remove_course_textbooks.sql`.
