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

Before displaying the menu, the program checks the core environment and input files:

- Node.js and npm versions
- scraper npm packages
- `scraper/venv` and its Python version
- `pdfplumber`, `pypdf`, and `fontTools`
- Python dependency consistency with `pip check`
- optional Simplified Chinese OCR language data
- semester-week input, the schedule manifest, and referenced schedule files
- curriculum-plan PDF availability

After a task and course filter are selected, the program warns when the selection includes
TLL content and checks OCRmyPDF, Tesseract English/Tamil data, Tamil fonts, and Ghostscript.
This applies to **All Items**, curriculum-plan parsing, and course parsing when the filter is
blank or can match `TLL*`. Missing required dependencies stop the program before any task
runs and print the exact setup commands. The preflight never installs software automatically.

The scraper asks which task to run:

```text
1. All Items (requires Tamil OCR dependencies)
2. Generate Semester Weeks
3. Parse Schedule PDFs
4. Download and Parse Course PDFs (TLL requires Tamil OCR dependencies)
5. Parse Curriculum Plan PDFs (requires Tamil OCR dependencies)
6. Exit
```

Pressing Enter selects **All Items**. It generates semester weeks, parses every schedule
PDF in the manifest, downloads fresh daytime/evening course PDFs, and parses the course
details and curriculum plans. TLL course synopsis pages and curriculum title cells that
retain unresolved CID glyphs after font repair are OCRed automatically with English and
Tamil. It does not upload anything to the database.

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

### Complete interactive sequence

1. Complete the dependency installation in section 1.
2. Prepare the semester-week file, schedule manifest, referenced schedule PDFs, and
   curriculum-plan PDFs as described in sections 4 and 5.
3. From the repository root, run `npm run scraper`.
4. Resolve any failed preflight checks, then rerun the command. The preflight reports
   missing packages or inputs but never installs or changes anything automatically.
5. Choose a task from the menu. Pressing Enter chooses **All Items**.
6. Choose **Both JSON and SQL** unless only one format is needed. Pressing Enter chooses
   both formats.
7. For **All Items**, **Parse Schedule PDFs**, or **Download and Parse Course PDFs**, enter
   a course filter or press Enter for all courses. Curriculum parsing always processes every
   PDF under `data/input/curriculum-plans/`.
8. Wait for every selected stage to finish. The scraper only writes local input/output
   artifacts; it never imports SQL automatically.
9. Review the generated JSON, download reports, and issue TSVs before considering any SQL
   import.
10. Import only the regular week, schedule, and course SQL when intended. Curriculum SQL
    follows the separate disposable-database process in section 9A.

The menu choices behave as follows:

| Choice | Requirements | Actions and outputs |
|---|---|---|
| **All Items** | All week, schedule, curriculum, and Tamil OCR prerequisites | Generates weeks, parses schedules, force-downloads fresh course PDFs, parses course details, then parses curriculum plans. |
| **Generate Semester Weeks** | Valid `data/input/weeks/semester-weeks.json` | Writes files under `data/output/weeks/`. |
| **Parse Schedule PDFs** | Valid manifest and referenced schedule files | Writes schedule JSON/SQL and `data/output/schedules/course-codes.txt`. Run this before course downloading when that code list does not exist. |
| **Download and Parse Course PDFs** | `course-codes.txt` from schedule parsing; Tamil OCR dependencies if the filter can include `TLL` | Downloads both daytime and evening variants with `--force`, then writes course JSON/SQL, reports, issues, and corrected OCR copies. |
| **Parse Curriculum Plan PDFs** | PDFs under `data/input/curriculum-plans/` and Tamil OCR dependencies | Parses every curriculum PDF and writes preliminary JSON/SQL, issues, and corrected OCR copies. Course filters do not apply. |
| **Exit** | None | Closes the menu without running a task. |

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

### From curriculum plan PDFs

The curriculum parser populates:

- `curriculum_plans` and `curriculum_requirements`
- `curriculum_plan_courses`
- `curriculum_prerequisite_rules` and `curriculum_prerequisites`
- `curriculum_course_exclusions`
- `curriculum_course_presentations`
- `curriculum_course_lifecycle_events`
- `curriculum_course_replacements`

Curriculum presentations describe published course availability. They do not create
semesters, classes, class events, or timetable data.

---

## 1. Install dependencies

Install the root project dependencies first, then the scraper dependencies:

```bash
cd ~/Git/SUSSplanner
npm install
cd scraper
npm install
```

Unless a later section explicitly says to return to the repository root, commands in
sections 1 through 12 run from `~/Git/SUSSplanner/scraper`.

On Ubuntu or WSL, install the base Python, database-client, and review tools if they are not
already available:

```bash
sudo apt update
sudo apt install python3-venv postgresql-client ripgrep jq
```

Python is needed because the scraper uses `pdfplumber` for PDF table/text extraction, plus `pypdf` and `fontTools` to repair embedded-font PDFs when Unicode maps are missing.

Recommended:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

The interactive workflow uses Tamil OCR for TLL course synopsis and curriculum-plan PDFs
when embedded-font repair leaves broken glyphs. **All Items and any TLL-inclusive course or
curriculum selection require these dependencies.** On Ubuntu/WSL, install:

```bash
sudo apt update
sudo apt install ghostscript tesseract-ocr-eng tesseract-ocr-tam fonts-noto-core
pip install -r requirements-ocr.txt
```

Verify the complete environment before leaving the `scraper` directory:

```bash
node --version
npm --version
python --version
python -m pip check
python -c "import pdfplumber, pypdf; from fontTools.ttLib import TTFont"
tesseract --list-langs
gs --version
fc-list ':family=Noto Sans Tamil' file
python tools/pdf_ocr.py --languages eng,tam
```

Node.js must be 20 or newer, npm must be 10 or newer, and Python must be 3.10 or
newer. The Tesseract language list must contain `eng` and `tam`, and the font command must
find Noto Sans Tamil. The final command validates OCRmyPDF and the required OCR resources.

If `requirements.txt` is missing, install manually:

```bash
pip install pdfplumber pypdf fonttools
```

Add `ocrmypdf` to that command when processing TLL content.

---

## 2. Prepare Supabase database

Skip sections 2 and 3 when only generating and reviewing local artifacts. A database
connection is required only when the reviewed regular SQL files are intentionally imported,
or when the preliminary curriculum model is evaluated in a disposable database.

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
    curriculum-plans/
      full-time/
      part-time/
      graduate_certificate/
      graduate_studies/
      law_programmes/
  output/
    weeks/
    schedules/
    courses/
      ocr-pdfs/
    curriculum/
      ocr-pdfs/
```

Create folders if needed:

```bash
mkdir -p data/input/schedules
mkdir -p data/input/weeks
mkdir -p data/input/courses/daytime
mkdir -p data/input/courses/evening
mkdir -p data/input/curriculum-plans
mkdir -p data/output/weeks data/output/schedules
mkdir -p data/output/courses/ocr-pdfs
mkdir -p data/output/curriculum/ocr-pdfs
```

Course PDF directories are populated by the downloader. Place curriculum PDFs anywhere
under `data/input/curriculum-plans/`; nested directories are scanned recursively. A
`full-time` or `part-time` path segment becomes the plan's study mode, and the first path
segment becomes its category. Keep category directory names stable because the relative
path is also used to build the plan key.

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

Run schedule parsing first so `data/output/schedules/course-codes.txt` contains the course
universe to download. The interactive **Download and Parse Course PDFs** action passes
`--force`, so it fetches fresh daytime and evening copies before parsing. The direct command
below skips existing valid PDFs unless `--force` is added.

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

Review it before parsing or importing course data:

```bash
less data/output/courses/download-report.tsv
```

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

Course codes beginning with `TLL` automatically inspect the initial extraction and OCR
only pages that still contain unresolved CID placeholders. No OCR flag is needed for TLL.
The source PDFs are never overwritten; corrected copies are saved under `--ocr-pdf-dir`.
Use `--ocr-on-cid` only to enable the same fallback for non-TLL course PDFs.

```bash
npm run parse:courses -- \
  --pdf-dir data/input/courses \
  --code-prefix TLL \
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

The curriculum parser reads every PDF under `data/input/curriculum-plans/`. It produces
normalized product records for:

- plans, requirement sections, credit-unit ranges, and selection rules
- active courses that can be added from a curriculum plan
- prerequisite rules with source text, course-code edges, and parse status
- excluded course combinations
- January, May, and July presentation records without timetable records
- retired and replaced course lifecycle events
- one-to-many course replacement relationships

The JSON keeps raw PDF rows, source coordinates, OCR metadata, and extraction warnings
under `review`. The SQL imports only the normalized product records.

It supports both the current nine-column offering tables and the five-column
retired/replaced-course tables. Wrapped course titles are joined to the preceding row, and
long course-code suffixes such as `BUS557Ae` and `CDO303ACI` are retained.
Chinese text is extracted directly as Unicode, and PDF line-wrap spaces between Chinese
characters are removed. If embedded-font repair leaves unresolved CID glyphs in a Tamil
programme course title, the parser OCRs only the affected pages and title cells using
English and Tamil. It validates the course code before accepting a title and leaves the
source PDFs unchanged. Reviewable OCR copies are written under
`data/output/curriculum/ocr-pdfs/`.

The current Chinese curriculum PDFs do not need OCR: their Chinese characters are
extractable Unicode. The parser checks for unresolved CID/replacement glyphs and removes
spaces introduced where a Chinese title wrapped across PDF lines. The optional Tesseract
`chi_sim` language pack is only needed if a future Chinese PDF is image-only or has broken
font encoding.

Run it through menu item **Parse Curriculum Plan PDFs**, or directly:

```bash
npm run parse:curriculum -- --format both
```

Tamil programme title OCR is automatic. Add `--ocr-on-cid` to enable the same fallback
for unresolved title glyphs in other curriculum plans.

Outputs:

```text
data/output/curriculum/curriculum-plans.json
data/output/curriculum/curriculum-plans.sql
data/output/curriculum/issues.tsv
```

Review the normalized records and issue report. Mixed `AND`/`OR` prerequisite rules and
non-course conditions use a review status and retain their source text.

Inspect the issue report and check for unresolved CID placeholders:

```bash
less data/output/curriculum/issues.tsv
rg '\(cid:' data/output/curriculum/curriculum-plans.json
```

No `rg` output means no unresolved CID placeholders were written to the curriculum JSON.
Also inspect records whose prerequisite `parseStatus` is `review_required` or `unparsed`:

```bash
jq '[.prerequisiteRules[] | select(.parseStatus != "parsed")]' \
  data/output/curriculum/curriculum-plans.json
```

The curriculum tables are a preliminary, optional schema extension. They are not part of
`schema.sql`, are not represented in the active Drizzle schema, and have not been deployed
to the application database. `curriculum-schema-extension.sql` is not a migration. Do not
apply either it or the generated curriculum import to a shared or production database while
this work is paused.

To evaluate the model in a disposable database, apply the normal schema first, followed by
the extension and the reviewed generated SQL:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f curriculum-schema-extension.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/curriculum/curriculum-plans.sql
```

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
rg '\(cid:' data/output/courses/course-details.json
```

No `rg` output means no unresolved CID placeholders were written to the parsed course JSON.

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

If you manually edit `course-details.json`, regenerate SQL without reparsing PDFs:

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
cd scraper
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

This is the normal application import path. It deliberately excludes
`curriculum-schema-extension.sql` and `curriculum-plans.sql`. Use the isolated evaluation
steps in section 9A for curriculum data; do not add those files to the shared or production
import sequence while the model remains preliminary.

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

## 14. Validate scraper changes

From the repository root, validate TypeScript, Python syntax, dependency consistency, and
the working-tree diff:

```bash
npm run typecheck
scraper/venv/bin/python -m py_compile scraper/tools/parse_curriculum_plans.py
scraper/venv/bin/python -m pip check
git diff --check
```

For a data refresh, validation also includes reviewing all generated JSON and TSV files,
checking TLL and curriculum JSON for unresolved CID placeholders, and sampling the imported
database rows with the queries in sections 7 and 12. These checks do not replace manual
review of complex prerequisite rules or OCR-corrected titles.

---

## 15. Troubleshooting

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

## 16. Data model

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
