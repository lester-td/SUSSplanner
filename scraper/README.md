# SUSS Scraper

This scraper is designed for a local workflow:

```text
School schedule PDFs + SUSS course synopsis PDFs
        ↓
local scraper
        ↓
parsed JSON + generated SQL
        ↓
Supabase Postgres import using psql
```
---

## Tech stack

This scraper/import workflow uses:

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Runs the scraper CLI commands |
| Language | TypeScript | Main scraper code, parsers, and SQL generation |
| Package manager | npm | Installs dependencies and runs scripts |
| TS runner | tsx | Runs TypeScript CLI scripts without a manual build step |
| PDF extraction | Python 3 + pdfplumber + pypdf + fontTools | Extracts tables/text from schedule PDFs and course synopsis PDFs, including embedded-font repair for Tamil PDFs |
| OCR fallback | OCRmyPDF + Tesseract | Rebuilds text for pages whose embedded fonts still leave unresolved Tamil CID glyphs |
| Database | Supabase Postgres | Stores courses, semesters, timetable events, and assessment data |
| DB import tool | psql | Imports generated SQL files into Supabase reliably |
| Frontend hosting | Vercel | Hosts the deployed web app; scraping is done locally, not inside Vercel |
| Data exchange | JSON + SQL files | JSON is used for review/debugging; SQL is used for database import |

Recommended local environment:

```text
Node.js 20+
npm 10+
Python 3.10+
PostgreSQL client / psql
```

The scraper is designed to run locally from your development machine.

---

# Guide

## Interactive menu

The normal maintainer workflow uses one interactive command from the repository root:

```bash
npm run scraper
```

Before displaying the menu, the program checks:

- Node.js and npm versions
- scraper npm packages
- `scraper/venv` and its Python version
- `pdfplumber`, `pypdf`, and `fontTools`
- Python dependency consistency with `pip check`
- OCRmyPDF, Tesseract English/Tamil data, Tamil fonts, and Ghostscript
- optional Simplified Chinese OCR language data
- semester-week input, the schedule manifest, and referenced schedule files
- curriculum-plan PDF availability

Missing required environment dependencies stop the program before the menu and print the
exact setup commands to run. Input and optional Simplified Chinese OCR notices are shown
before the menu. The preflight never installs software automatically.

The scraper asks which task to run:

```text
1. All Items
2. Generate Semester Weeks
3. Parse Schedule PDFs
4. Download and Parse Course PDFs
5. Parse Curriculum Plan PDFs
6. Exit
```

Pressing Enter selects **All Items**. It generates semester weeks, parses every schedule
PDF in the manifest, downloads fresh daytime/evening course PDFs, and parses the course
details and curriculum plans. It does not upload anything to the database.

For every work item, the menu asks whether to produce JSON, SQL, or both. Schedule and
course actions also accept an optional course filter. Leave it blank for every course, use
`TLL*` for a prefix, or enter exact codes such as `TLL101,TLL201`.

The defaults are:

```text
Semester weeks      scraper/data/input/weeks/semester-weeks.json
Schedule manifest   scraper/data/input/schedules/manifest.json
Schedule PDFs       scraper/data/input/schedules/*.pdf
Course PDFs         scraper/data/input/courses/{daytime,evening}/*.pdf
Curriculum PDFs     scraper/data/input/curriculum-plans/**/*.pdf
Generated files     scraper/data/output/{weeks,schedules,courses,curriculum}/
```

The individual commands documented below remain available for filtered or diagnostic runs,
but their standard manifest, input, and output paths no longer need to be supplied.
For those commands, `--format json`, `--format sql`, and `--format both` match the
interactive format choices.

---

## 0. What the scraper imports

### From schedule PDFs

The schedule PDF scraper populates:

- `semesters`
- `semester_weeks`, from the separate semester-weeks JSON manifest
- `courses`, basic fields from the schedule PDF
- `classes`
- `class_events`

### From online course synopsis PDFs

The course synopsis scraper populates or updates:

- `courses`, detailed latest course information
- `assessment_components`, latest assessment strategy by `course_code + schedule_type`

The online synopsis URL only gives the latest/current course synopsis, so assessment data is not treated as historical by semester.

---

## 1. Install dependencies

From the scraper project root:

```bash
cd ~/Git/SUSSplanner/scraper
npm install
```

Python is needed because the scraper uses `pdfplumber` for PDF table/text extraction, plus `pypdf` and `fontTools` to repair embedded-font PDFs when Unicode maps are missing.

Recommended:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

The interactive workflow uses Tamil OCR when curriculum PDFs contain broken embedded
glyphs. On Ubuntu/WSL, install its system dependencies and Python requirements:

```bash
sudo apt update
sudo apt install ghostscript tesseract-ocr-eng tesseract-ocr-tam fonts-noto-core
pip install -r requirements-ocr.txt
```

If `requirements.txt` is missing, install manually:

```bash
pip install pdfplumber pypdf fonttools
```

Add `ocrmypdf` to that command when using the interactive curriculum workflow.

---

## 2. Prepare Supabase database

### Option A: fresh reset of public schema

Only do this if you are okay deleting all existing imported data in `public`.

Run in Supabase SQL Editor:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
```

Then run the latest schema:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
```

### Option B: existing database

If you are not resetting, make sure the schema is already on the latest version:

- `courses` does **not** have `course_textbooks`
- `assessment_components` has `schedule_type`
- `assessment_components` does **not** have `semester_id`

Check:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'assessment_components'
ORDER BY ordinal_position;
```

Expected columns:

```text
component_id
course_code
schedule_type
component_name
component_group
assessment_mode
weight_percentage
sort_order
last_updated
```

---

## 3. Set DATABASE_URL locally

Get the Supabase database connection string from:

```text
Supabase Dashboard → Project Settings → Database → Connection string
```

Then export it in your terminal:

```bash
export DATABASE_URL='postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-xxx.pooler.supabase.com:6543/postgres?sslmode=require'
```

Do not commit this value to Git.

Test:

```bash
psql "$DATABASE_URL" -c "SELECT now();"
```

---

## 4. Prepare input folders

Recommended folder structure:

```text
data/
  input/
    weeks/
      semester-weeks.json
    schedules/
      manifest.json
      daytime-jan26-may26.pdf
      evening-jan26-may26.pdf
      daytime-jul26.pdf
      evening-jul26.pdf
    courses/
      daytime/
      evening/
  output/
    weeks/
    schedules/
    courses/
```

Create folders if needed:

```bash
mkdir -p data/input/schedules
mkdir -p data/input/weeks
mkdir -p data/input/courses/daytime
mkdir -p data/input/courses/evening
mkdir -p data/output/weeks data/output/schedules data/output/courses
```

---

## 5. Create schedule manifest

Create or edit:

```text
data/input/schedules/manifest.json
```

Example:

```json
{
  "schedules": [
    {
      "pdf": "data/input/schedules/evening-jan26-may26.pdf",
      "scheduleType": "evening"
    },
    {
      "pdf": "data/input/schedules/daytime-jan26-may26.pdf",
      "scheduleType": "daytime"
    },
    {
      "pdf": "data/input/schedules/evening-jul26.pdf",
      "scheduleType": "evening"
    },
    {
      "pdf": "data/input/schedules/daytime-jul26.pdf",
      "scheduleType": "daytime"
    }
  ]
}
```

Use:

```text
daytime schedule PDF → "scheduleType": "daytime"
evening schedule PDF → "scheduleType": "evening"
```

---

## 6. Generate and import semester weeks

The app uses continuous week numbers.

Example for January regular semester:

```text
Week 0    = TEACHING, shown when selected classes have pre-term events
Week 1-12 = TEACHING
Week 13   = STUDY
Week 14   = EXAM, Exam Week 1
Week 15   = EXAM, Exam Week 2
```

Example for May special semester:

```text
Week 0   = TEACHING, shown when selected classes have pre-term events
Week 1-6 = TEACHING
Week 7   = EXAM
```

Generate SQL:

```bash
npm run generate:weeks -- \
  --input data/input/weeks/semester-weeks.json \
  --out data/output/weeks/semester-weeks.sql
```

Import:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/weeks/semester-weeks.sql
```

---

## 7. Scrape schedule PDFs

### Filter by course code

All scraper commands that read or produce course data accept the same case-insensitive filters:

```text
--codes TLL101,TLL201       exact course codes, separated by commas or spaces
--codes-file path/to/codes  exact course codes read from a file
--code-prefix TLL           every course code beginning with the prefix
```

Multiple prefixes can be comma-separated, for example `--code-prefix TLL,TSL`. On conversion
commands, multiple selectors use union semantics: a course is included when it matches any
exact code or prefix.

For example, generate schedule JSON and SQL containing only `TLL` courses:

```bash
npm run scrape:all -- \
  --manifest data/input/schedules/manifest.json \
  --code-prefix TLL \
  --out data/output/tll-schedules-import.sql \
  --json data/output/tll-schedules-parsed.json \
  --course-codes-out data/output/tll-course-codes.txt
```

The filters are supported by `scrape:schedule`, `scrape:all`, `download:courses`,
`parse:courses`, `courses-json-to-sql`, and `schedule-json-to-sql`. Commands that load
course codes for downloading use `data/output/schedules/course-codes.txt` as the prefix-search
universe unless another `--codes-file` is supplied; inline `--codes` are added to that universe.

Run:

```bash
npm run scrape:all -- \
  --manifest data/input/schedules/manifest.json \
  --out data/output/schedules/schedules.sql \
  --json data/output/schedules/schedules.json \
  --course-codes-out data/output/schedules/course-codes.txt
```

Outputs:

```text
data/output/schedules/schedules.sql      SQL for semesters/courses/classes/class_events
data/output/schedules/schedules.json     parsed schedule data
data/output/schedules/course-codes.txt   unique course codes found in schedules
```

If you already have `schedules.json` and just want to regenerate SQL using the latest schema:

```bash
npm run schedule-json-to-sql -- \
  --json data/output/schedules/schedules.json \
  --out data/output/schedules/schedules.sql \
  --course-codes-out data/output/schedules/course-codes.txt
```

Import schedule SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules/schedules.sql
```

Quick checks:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM courses;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM classes;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM class_events;"
```

---

## 8. Download online course synopsis PDFs

The course synopsis URL pattern is:

```text
https://sims1.suss.edu.sg/eservice/public/viewcourse/viewcourse.aspx?crsecd=COURSECODE&viewtype=pdf&isft=X
```

The scraper tries both versions:

```text
isft=1 → daytime
isft=0 → evening
```

It saves valid PDFs only. HTML responses like `No Record Found` are not saved as PDFs.

Run:

```bash
npm run download:courses -- \
  --codes-file data/output/schedules/course-codes.txt \
  --out-dir data/input/courses \
  --report-out data/output/courses/download-report.tsv \
  --manifest-out data/output/courses/downloads.json
```

Outputs:

```text
data/input/courses/daytime/*.pdf
data/input/courses/evening/*.pdf
data/output/courses/download-report.tsv
data/output/courses/downloads.json
```

The report has three main columns:

```text
course_code    daytime    evening
```

A tick/check means that version was downloaded.

If you need to redownload everything:

```bash
npm run download:courses -- \
  --codes-file data/output/schedules/course-codes.txt \
  --out-dir data/input/courses \
  --report-out data/output/courses/download-report.tsv \
  --manifest-out data/output/courses/downloads.json \
  --force
```

---

## 9. Parse course synopsis PDFs

Run:

```bash
npm run parse:courses -- \
  --pdf-dir data/input/courses \
  --codes-file data/output/schedules/course-codes.txt \
  --out data/output/courses/course-details.sql \
  --json data/output/courses/course-details.json \
  --issues-out data/output/courses/parse-issues.tsv
```

### Automatically OCR unresolved Tamil CID glyphs

Add `--ocr-on-cid` to inspect the initial extraction and OCR only pages that still contain
unresolved CID placeholders. The source PDFs are never overwritten; corrected copies are
saved under `--ocr-pdf-dir`.

```bash
npm run parse:courses -- \
  --pdf-dir data/input/courses \
  --code-prefix TLL \
  --ocr-on-cid \
  --ocr-languages eng,tam \
  --ocr-pdf-dir data/output/courses/ocr-pdfs \
  --out data/output/tll-course-details-import.sql \
  --json data/output/tll-course-details-parsed.json \
  --issues-out data/output/tll-course-parse-issues.tsv
```

The raw extraction JSON records which pages were OCR processed. Any CID placeholders that
remain after OCR are included in the issues TSV. Verify that none remain before importing:

```bash
rg '\(cid:' data/output/tll-course-details-parsed.json
```

No output means no unresolved CID placeholders were written to the parsed JSON.

The OCR parser performs a dependency preflight before reading any PDFs. For Tamil OCR it
requires the `Noto Sans Tamil` font supplied by Ubuntu's `fonts-noto-core` package. Verify it with:

```bash
fc-list ':family=Noto Sans Tamil' file
```

### Preprocess OCR PDFs separately

The same Python OCR implementation can create corrected copies as a separate step:

```bash
npm run ocr:courses -- \
  --input-dir data/input/courses \
  --output-dir data/output/courses/ocr-pdfs \
  --code-prefix TLL \
  --pages 1 \
  --languages eng,tam
```

Existing OCR copies are skipped unless `--force` is supplied. Parse the copies by passing
`--pdf-dir data/output/courses/ocr-pdfs` to `parse:courses`; do not add `--ocr-on-cid` again.

Outputs:

```text
data/output/courses/course-details.sql      SQL for courses + assessment_components
data/output/courses/course-details.json     parsed course details
data/output/courses/parse-issues.tsv        parser warnings/errors
```

The parser skips PDFs whose extracted text says:

```text
No Record Found
```

The parser no longer extracts or stores textbooks.

---

## 9A. Parse curriculum plan PDFs

The first-cut curriculum parser reads every PDF under `data/input/curriculum-plans/` and
preserves each course row in the context of its programme plan and section. It extracts:

- programme name, category, study mode, and source location
- section name and section credit-unit requirement
- course code, title, and credit units
- prerequisite and excluded-combination source text plus referenced course codes
- grouping, remarks, timetable text, status, and effective semester
- every presentation column and the semesters marked `Y`
- source page/table/row coordinates and extraction warnings

It supports both the current nine-column offering tables and the five-column
retired/replaced-course tables. Wrapped course titles are joined to the preceding row, and
long course-code suffixes such as `BUS557Ae` and `CDO303ACI` are retained.
Chinese text is extracted directly as Unicode, and PDF line-wrap spaces between Chinese
characters are removed. If embedded-font repair leaves unresolved CID glyphs in a course
title (currently seen in Tamil rows), the interactive menu OCRs only the affected pages
and title cells using English and Tamil. It validates the course code before accepting a
replacement and leaves the source PDFs unchanged. Reviewable OCR copies are written under
`data/output/curriculum/ocr-pdfs/`.

The current Chinese curriculum PDFs do not need OCR: their Chinese characters are
extractable Unicode. The parser checks for unresolved CID/replacement glyphs and removes
spaces introduced where a Chinese title wrapped across PDF lines. The optional Tesseract
`chi_sim` language pack is only needed if a future Chinese PDF is image-only or has broken
font encoding.

Run it through menu item **Parse Curriculum Plan PDFs**, or directly:

```bash
npm run parse:curriculum -- --format both --ocr-on-cid
```

Outputs:

```text
data/output/curriculum/curriculum-plans.json
data/output/curriculum/curriculum-plans.preview.sql
data/output/curriculum/issues.tsv
```

The SQL is deliberately marked **PREVIEW ONLY** and targets provisional
`curriculum_plans` and `curriculum_plan_courses` tables. Those tables do not exist yet.
Do not import that file until the curriculum schema has been reviewed and approved. This
first cut does not modify `schema.sql`, Drizzle mappings, migrations, or the database.

---

## 10. Inspect course parse results before importing

Check the issue report:

```bash
less data/output/courses/parse-issues.tsv
```

Useful commands:

```bash
head -50 data/output/courses/parse-issues.tsv
wc -l data/output/courses/parse-issues.tsv
```

Common warning types:

```text
course_name_missing
synopsis_missing
assessment_not_found
assessment_total_not_100
no_record_found
```

If assessment total is not 100, the scraper should skip assessment inserts for that course/schedule type instead of importing bad data.

---

## 11. Regenerate SQL from course JSON only

If you manually edit `course-details-parsed.json`, regenerate SQL without reparsing PDFs:

```bash
npm run courses-json-to-sql -- \
  --json data/output/courses/course-details.json \
  --out data/output/courses/course-details.sql \
  --issues-out data/output/course-json-to-sql-issues.tsv
```

Then inspect:

```bash
less data/output/course-json-to-sql-issues.tsv
```

---

## 12. Import course details SQL

Import:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/courses/course-details.sql
```

Quick checks:

```bash
psql "$DATABASE_URL" -c "
SELECT course_code, course_name, course_level, credit_units, presentation_pattern
FROM courses
WHERE credit_units IS NOT NULL
ORDER BY course_code
LIMIT 20;
"
```

```bash
psql "$DATABASE_URL" -c "
SELECT course_code, schedule_type, component_name, component_group, assessment_mode, weight_percentage
FROM assessment_components
ORDER BY course_code, schedule_type, sort_order
LIMIT 50;
"
```

Check courses with no assessment:

```bash
psql "$DATABASE_URL" -c "
SELECT c.course_code, c.course_name
FROM courses c
LEFT JOIN assessment_components ac
  ON ac.course_code = c.course_code
WHERE ac.course_code IS NULL
ORDER BY c.course_code
LIMIT 50;
"
```

---

## 13. Recommended full import order

For the normal refresh workflow, run the menu from the repository root:

```bash
npm run scraper
```

1. Choose **All Items**.
2. Choose **Both JSON and SQL** unless you only need one representation.
3. Leave the course filter blank for all courses, or enter a filter such as `TLL*`.
4. Review `scraper/data/output/`, especially the parsed JSON, download report, and issue TSV.
5. Import the reviewed SQL using the commands below, validate snapshots, and deploy.

The equivalent low-level sequence for a fresh database is:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql

npm run generate:weeks -- \
  --input data/input/weeks/semester-weeks.json \
  --out data/output/weeks/semester-weeks.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/weeks/semester-weeks.sql

npm run scrape:all -- \
  --manifest data/input/schedules/manifest.json \
  --out data/output/schedules/schedules.sql \
  --json data/output/schedules/schedules.json \
  --course-codes-out data/output/schedules/course-codes.txt
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules/schedules.sql

npm run download:courses -- \
  --codes-file data/output/schedules/course-codes.txt \
  --out-dir data/input/courses \
  --report-out data/output/courses/download-report.tsv \
  --manifest-out data/output/courses/downloads.json

npm run parse:courses -- \
  --pdf-dir data/input/courses \
  --codes-file data/output/schedules/course-codes.txt \
  --out data/output/courses/course-details.sql \
  --json data/output/courses/course-details.json \
  --issues-out data/output/courses/parse-issues.tsv
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/courses/course-details.sql
```

### Publish the imported data to the application

The production application serves build-time JSON snapshots and does not query
Postgres during user requests. After verifying the import, return to the
repository root and run:

```bash
cd ..
npm run data:build
npm test
npm run typecheck
```

Review the generated counts, then trigger a new Vercel deployment. Vercel runs
the same snapshot generator during `prebuild`, so database-only updates do not
require committing generated JSON. See `docs/DataSnapshots.md` for the complete
publication and rollback workflow.

---

## 14. Troubleshooting

### SQL file too large for Supabase SQL Editor

Use `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules/schedules.sql
```

Do not paste large 20 MB SQL files into Supabase SQL Editor.

### Parser creates null course names

The scraper should preserve existing schedule-imported course names and avoid overwriting with null. Check the issues TSV for `course_name_missing`.

### Course PDF says `No Record Found`

This is not a parser bug. The SUSS URL returned a valid PDF with no course record. The parser skips it.

### Assessment total not 100

Usually caused by PDF table extraction artifacts or page breaks. The improved parser strips page footer text and carries OCAS/OES state across page breaks. If it still reports a non-100 total, inspect the source PDF manually before importing.

---

## 15. Data model

The latest schema intentionally separates data this way:

```text
courses
  latest course-level information from online course synopsis

semesters + semester_weeks
  academic calendar structure

classes + class_events
  semester-specific timetable rows from school schedule PDFs

assessment_components
  latest assessment strategy by course_code + schedule_type
```

`assessment_components` is not tied to `semester_id` because the SUSS course synopsis URL only exposes the latest/current version, not historical versions.
