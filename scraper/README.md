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
| PDF extraction | Python 3 + pdfplumber | Extracts tables/text from schedule PDFs and course synopsis PDFs |
| Database | Supabase Postgres | Stores courses, semesters, timetable events, and assessment data |
| DB import tool | psql | Imports generated SQL files into Supabase reliably |
| Frontend hosting | Vercel | Hosts the deployed web app; scraping is done locally, not inside Vercel |
| Data exchange | JSON + SQL files | JSON is used for review/debugging; SQL is used for database import |

Recommended local environment:

```text
Node.js 18+
npm 9+
Python 3.10+
PostgreSQL client / psql
```

The scraper is designed to run locally from your development machine.

---

# Guide

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

Python is needed because the scraper uses `pdfplumber` for PDF table/text extraction.

Recommended:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

If `requirements.txt` is missing, install manually:

```bash
pip install pdfplumber
```

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
    schedules/
      daytime-jan26-may26.pdf
      evening-jan26-may26.pdf
      daytime-jul26.pdf
      evening-jul26.pdf
    course-pdfs/
      daytime/
      evening/
    semester-weeks.2026.json
    schedule-manifest.json
  output/
```

Create folders if needed:

```bash
mkdir -p data/input/schedules
mkdir -p data/input/course-pdfs/daytime
mkdir -p data/input/course-pdfs/evening
mkdir -p data/output
```

---

## 5. Create schedule manifest

Create or edit:

```text
data/input/schedule-manifest.json
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
Week 1-12 = TEACHING
Week 13   = STUDY
Week 14   = EXAM, Exam Week 1
Week 15   = EXAM, Exam Week 2
```

Example for May special semester:

```text
Week 1-6 = TEACHING
Week 7   = EXAM
```

Generate SQL:

```bash
npm run generate:weeks -- \
  --input data/input/semester-weeks.2026.json \
  --out data/output/semester-weeks-import.sql
```

Import:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/semester-weeks-import.sql
```

---

## 7. Scrape schedule PDFs

Run:

```bash
npm run scrape:all -- \
  --manifest data/input/schedule-manifest.json \
  --out data/output/schedules-import.sql \
  --json data/output/schedules-parsed.json \
  --course-codes-out data/output/course-codes.txt
```

Outputs:

```text
data/output/schedules-import.sql      SQL for semesters/courses/classes/class_events
data/output/schedules-parsed.json     parsed schedule data
data/output/course-codes.txt          unique course codes found in schedules
```

If you already have `schedules-parsed.json` and just want to regenerate SQL using the latest schema:

```bash
npm run schedule-json-to-sql -- \
  --json data/output/schedules-parsed.json \
  --out data/output/schedules-import.sql \
  --course-codes-out data/output/course-codes.txt
```

Import schedule SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules-import.sql
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
  --codes-file data/output/course-codes.txt \
  --out-dir data/input/course-pdfs \
  --report-out data/output/course-pdf-download-report.tsv \
  --manifest-out data/output/course-pdf-downloads.json
```

Outputs:

```text
data/input/course-pdfs/daytime/*.pdf
data/input/course-pdfs/evening/*.pdf
data/output/course-pdf-download-report.tsv
data/output/course-pdf-downloads.json
```

The report has three main columns:

```text
course_code    daytime    evening
```

A tick/check means that version was downloaded.

If you need to redownload everything:

```bash
npm run download:courses -- \
  --codes-file data/output/course-codes.txt \
  --out-dir data/input/course-pdfs \
  --report-out data/output/course-pdf-download-report.tsv \
  --manifest-out data/output/course-pdf-downloads.json \
  --force
```

---

## 9. Parse course synopsis PDFs

Run:

```bash
npm run parse:courses -- \
  --pdf-dir data/input/course-pdfs \
  --codes-file data/output/course-codes.txt \
  --out data/output/course-details-import.sql \
  --json data/output/course-details-parsed.json \
  --issues-out data/output/course-parse-issues.tsv
```

Outputs:

```text
data/output/course-details-import.sql      SQL for courses + assessment_components
data/output/course-details-parsed.json     parsed course details
data/output/course-parse-issues.tsv        parser warnings/errors
```

The parser skips PDFs whose extracted text says:

```text
No Record Found
```

The parser no longer extracts or stores textbooks.

---

## 10. Inspect course parse results before importing

Check the issue report:

```bash
less data/output/course-parse-issues.tsv
```

Useful commands:

```bash
head -50 data/output/course-parse-issues.tsv
wc -l data/output/course-parse-issues.tsv
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
  --json data/output/course-details-parsed.json \
  --out data/output/course-details-import.sql \
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
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/course-details-import.sql
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

For a fresh database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql

npm run generate:weeks -- \
  --input data/input/semester-weeks.2026.json \
  --out data/output/semester-weeks-import.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/semester-weeks-import.sql

npm run scrape:all -- \
  --manifest data/input/schedule-manifest.json \
  --out data/output/schedules-import.sql \
  --json data/output/schedules-parsed.json \
  --course-codes-out data/output/course-codes.txt
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules-import.sql

npm run download:courses -- \
  --codes-file data/output/course-codes.txt \
  --out-dir data/input/course-pdfs \
  --report-out data/output/course-pdf-download-report.tsv \
  --manifest-out data/output/course-pdf-downloads.json

npm run parse:courses -- \
  --pdf-dir data/input/course-pdfs \
  --codes-file data/output/course-codes.txt \
  --out data/output/course-details-import.sql \
  --json data/output/course-details-parsed.json \
  --issues-out data/output/course-parse-issues.tsv
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/course-details-import.sql
```

---

## 14. Troubleshooting

### SQL file too large for Supabase SQL Editor

Use `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/schedules-import.sql
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
