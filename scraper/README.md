# SUSS Scraper

Run the scraper locally to parse source PDFs and generate SQL for import:

This directory is a standalone project: its dependencies, commands, type checks,
and tests run without the web application. Default output paths stay inside
the scraper directory. Publishing data to the application is a separate step.

```text
School schedule PDFs + SUSS course synopsis PDFs
        ↓
local scraper
        ↓
parsed JSON + generated SQL
        ↓
Supabase Postgres import using psql
```

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Runs the scraper CLI commands |
| Language | TypeScript | Main scraper code, parsers, and SQL generation |
| Package manager | npm | Installs dependencies and runs scripts |
| TS runner | tsx | Runs TypeScript CLI scripts without a manual build step |
| PDF extraction | Python 3 + pdfplumber + pypdf + fontTools | Extracts tables/text from schedule PDFs and course synopsis PDFs, including embedded-font repair for Tamil PDFs |
| OCR fallback | OCRmyPDF + Tesseract | Rebuilds text for pages whose embedded fonts still leave unresolved Tamil CID glyphs |
| Database | Supabase Postgres | Stores courses, semesters, timetable events, and assessment data |
| DB import tool | psql | Imports generated SQL into Supabase |
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

Before displaying the menu, the program validates the core environment and reports
input readiness:

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
blank or can match `TLL*`. **All Items** and curriculum parsing always require Tamil OCR,
even when a course filter excludes TLL, because curriculum parsing is unfiltered.
Missing required dependencies stop the program before any task runs and print setup
commands. Missing inputs are reported but do not prevent opening the menu; the selected
task must have its inputs ready. The preflight never installs software automatically.

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

The individual commands documented below remain available for diagnostic runs.
`generate:weeks`, `scrape:all`, `parse:courses`, and `parse:curriculum` accept
`--format json`, `--format sql`, and `--format both` (the default), matching the
interactive choices. Batch schedule parsing always writes the course-code list and
cohort index, regardless of format. `scrape:schedule` writes both JSON and SQL and
requires a PDF/CSV source plus intake mappings. The JSON-to-SQL commands require
`--json` and produce SQL; downloading produces PDFs and reports.

---

## 0. What the scraper imports

### From schedule PDFs

The schedule PDF scraper populates:

- `semesters`
- `semester_weeks`, from the separate semester-weeks JSON manifest
- `courses`, basic fields from the schedule PDF
- `classes`
- `class_events`

`class_events.campus` stores the schedule's `CAMPUS` code (`CLE`, `AMK`,
`EXT`, or `ONL`). The CSV parser also accepts older `VENUE` headers, and the
JSON-to-SQL importer accepts legacy `venue` fields.
`classes.language` stores the PDF's language of instruction. Older schedules
without a `LANGUAGE` column leave it null; reimporting them preserves any known
language already stored in the database.

### From online course synopsis PDFs

The course synopsis scraper populates or updates:

- `courses`, detailed latest course information
- `assessment_components`, latest assessment strategy by `course_code + schedule_type`

The synopsis endpoint exposes the latest version; assessments are not historical
semester records.

### From curriculum plan PDFs

The curriculum parser generates records for these optional tables:

- `curriculum_plans` and `curriculum_requirements`
- `curriculum_plan_courses`
- `curriculum_prerequisite_rules` and `curriculum_prerequisites`
- `curriculum_course_exclusions`
- `curriculum_course_presentations`
- `curriculum_course_lifecycle_events`
- `curriculum_course_replacements`

Curriculum presentations describe published course availability. They do not create
semesters, classes, class events, or timetable data.

## 1. Install dependencies

From the repository root, install and validate the standalone scraper:

```bash
cd scraper
npm install
npm test
npm run typecheck
```

Unless a later section explicitly says to return to the repository root, commands in
sections 1 through 12 run from the `scraper/` directory. Open the menu there with
`npm start`, or use `npm run scraper` from the repository root. Web application
dependencies are installed separately with `npm install` at the repository root.

On Ubuntu or WSL, install the base Python, database-client, and review tools if they are not
already available:

```bash
sudo apt update
sudo apt install python3-venv postgresql-client ripgrep jq
```

Python is needed because the scraper uses `pdfplumber` for PDF table/text extraction, plus `pypdf` and `fontTools` to repair embedded-font PDFs when Unicode maps are missing.

Create and activate the Python environment:

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


## 2. Prepare Supabase database

### Schedule metadata and announcements

`schema.sql` defines the database used by schedule imports and app snapshots:

- `class_events.campus` and the corresponding view column store campus codes.
- Nullable `classes.language` stores the language of instruction.
- `semesters.is_archived NOT NULL DEFAULT false` controls semester visibility.
  The scraper's semester upserts preserve this maintainer-controlled flag.
- `announcements` stores a unique ID, message, optional link URL and label,
  publication and expiry timestamps, enabled flag, display order, and update timestamp.
  Announcements default to disabled. Links require both URL and label; expiry must
  follow publication; blank messages are rejected.
- The schema enables RLS on `announcements` and revokes table/sequence privileges from
  `PUBLIC`, `anon`, and `authenticated` (when those roles exist). There are no
  browser access policies: maintainers use the SQL editor, and builds read through
  the privileged `DATABASE_URL` connection. If using a custom database role, it
  must have the necessary permissions and either own the table or have `BYPASSRLS`.

Rebuild app snapshots with `npm run data:build` from the repository root afterward.
Snapshots exclude archived semesters, their schedule shards, and course offering
metadata; the database retains those records. Active completion sessions keep only
an ownership ID for restoring an active timetable. Snapshots also include
announcement publication windows. The notification UI checks enabled announcements against the
current time on mount, on focus, and every minute, so future publication and expiry
work without another snapshot build.
Existing snapshots remain readable with missing fields treated as unarchived,
unknown language, and no announcements. Fresh databases can use `schema.sql` directly.

Archived semesters cannot appear in the timetable, course search, course detail,
or semester planner, including through old saved/shared links. To restore a term,
clear its archive flag and rebuild. Announcements appear in the
global notification stack and can be dismissed per browser. No semesters are
automatically archived and the schema does not insert announcements.

Manage these records directly in the database, then run `npm run build` and deploy.
The existing `prebuild` hook regenerates snapshots before the Next.js build; a
database edit becomes visible with the newly deployed build. The database must
match `schema.sql` before building snapshots.

To archive or restore a semester, set `is_archived` by its ID:

```sql
UPDATE semesters SET is_archived = true WHERE semester_id = YOUR_SEMESTER_ID;
-- Restore it with is_archived = false.
```

Example announcement draft (enable it only after the schedules are imported and
ready to publish):

```sql
INSERT INTO announcements (message, link_url, link_label, enabled)
VALUES ('January & May 2027 course schedules are now available.',
        '/courses', 'View courses', false);
```

Use the announcement ID as the browser dismissal key. A new announcement gets a
new ID; editing an existing announcement keeps its dismissal identity. Publication
timestamps are `TIMESTAMPTZ`; use an explicit `+08:00` offset for Singapore times.
Set `enabled = true` when a draft is ready to publish, or `enabled = false` to
withdraw it, then rebuild/deploy. Set `expires_at` to end its display automatically.

### Intake schedule availability

`schema.sql` defines `semesters.has_intake_schedule NOT NULL DEFAULT false`.
Set this flag explicitly after importing and validating each intake's schedule.

Offering filters and intake selectors hide semesters whose flag is `false`.
The timetable keeps active continuation destinations accessible and shows a
dismissible notice alongside Week 0 and Study Week classes. Course snapshots
retain those destinations separately as `scheduledSemesters`, so adding a May
class still creates its July continuation. New enrolments in an unavailable
intake are rejected. Archived terms remain hidden from both uses.

The flag is maintainer-controlled. Calendar and schedule imports preserve it;
new semesters default to unavailable. After importing and checking a new intake's
actual schedule, enable it explicitly, then rebuild and deploy:

```sql
UPDATE public.semesters
SET has_intake_schedule = true
WHERE academic_year = '2027/2028' AND semester_no = 1;
```

The July timetable notice disappears when that flag becomes `true`. Older
snapshots without the field retain their previous visibility until rebuilt.

Skip sections 2 and 3 when only generating and reviewing local artifacts. A database
connection is required only when the reviewed regular SQL files are intentionally imported,
or when the preliminary curriculum model is evaluated in a disposable database.

### Option A: fresh reset of public schema

This deletes all existing data in `public`. Use it only for an intentional reset.
Set [DATABASE_URL](#3-set-database_url-locally) before running `psql`.

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

Apply the schema:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
```

### Option B: existing database

Compare the existing database with `schema.sql` and apply reviewed schema
changes before importing. Check at least:

- `semesters.is_archived` and `semesters.has_intake_schedule` exist.
- `classes.language` and `class_events.campus` exist.
- Academic-calendar tables and `announcements` exist.
- `assessment_components` has `schedule_type` and no `semester_id`.

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

## 4. Prepare input folders

Recommended folder structure:

```text
data/
  input/
    weeks/
      semester-weeks.json
    schedules/
      manifest.json
      Full_Interim_Course_Schedule.pdf
      daytime-jan26-may26.pdf
      evening-jan26-may26.pdf
      daytime-jul26.pdf
      evening-jul26.pdf
    courses/
      daytime/
      evening/
    semester-weeks.2027.json        standalone 2027 calendar
    curriculum-plans/
      undergraduate/
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

Example manifest for a combined PDF:

```json
{
  "schedules": [
    {
      "pdf": "data/input/schedules/Full_Interim_Course_Schedule.pdf",
      "scheduleType": "auto",
      "intakes": {
        "regular": "January 2027",
        "special": "May 2027"
      }
    }
  ]
}
```

`auto` classifies each row by group code: `TG` is daytime and `CRN` is
evening. It is also the default when `scheduleType` is omitted. Classification
uses the group code, including for weekend classes and exams.

For separate files, use `"scheduleType": "daytime"` or
`"scheduleType": "evening"`. These validate that every parsed row matches the
specified type; a mismatch stops the import with an instruction to use `auto`.
You can list multiple input files in the manifest when importing several intakes.
Each entry needs a `pdf` or `csv` path, relative to the `scraper/` working directory,
and explicit `intakes`. `regular` uses January or July; `special` uses May. For
older January/May 2026 files, use `{ "regular": "January 2026", "special": "May 2026" }`;
for July 2026 files, use `{ "regular": "July 2026" }`.

The PDF's `SEMESTER TYPE` selects the declared intake for each row. December
pre-term sessions of a January course stay under January; August completion of
a May course stays under May. Event dates are preserved. Unknown semester types
or missing intake mappings stop the import rather than guessing from dates.
Each source represents at most one regular and one special intake; list separate
sources for documents covering multiple regular intakes.

For a single combined PDF, run:

```bash
npm run scrape:schedule -- \
  --pdf data/input/schedules/Full_Interim_Course_Schedule.pdf \
  --schedule-type auto \
  --regular-semester "January 2027" \
  --special-semester "May 2027" \
  --out data/output/schedules/schedule.sql \
  --json data/output/schedules/schedule.json
```

`--schedule-type` is optional and defaults to `auto`. The batch importer and
cohort generator use the same manifest and classification rules.

## 6. Generate and import semester weeks

The menu and `generate:weeks` default to `data/input/weeks/semester-weeks.json`,
which contains both the 2026 and 2027 calendars. The standalone 2027 calendar remains
at `data/input/semester-weeks.2027.json`; pass it with `--input` when generating only
2027. The 2027 dates follow the supplied academic calendar:

| Semester | Teaching weeks | Study/revision | Examinations |
| --- | --- | --- | --- |
| January 2027 | 11 January–3 April | 4–10 April | 12–17 and 19–24 April |
| May 2027 (special) | 3 May–12 June | 13–19 June, overlapping exams | 14–19 June |
| July 2027 | 9 August–30 October | 1–6 November | 8–13 and 15–20 November |

Each term also has a Week 0 for pre-term sessions: 4–10 January, 26 April–2 May,
and 2–8 August. The special semester retains one Exam Week (week 7), rather than
creating a separate overlapping Study Week. January and May belong to AY
2026/2027; July belongs to AY 2027/2028. Week boundaries follow the marked calendar
periods, so final teaching weeks and exam weeks end on Saturday, and unmarked
Sundays can fall outside a week.

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

## 7. Scrape schedule PDFs

### Filter by course code

The schedule and course commands listed below accept these case-insensitive filters.
Curriculum parsing processes all plans and does not apply course filters:

```text
--codes TLL101,TLL201       exact course codes, separated by commas or spaces
--codes-file path/to/codes  exact course codes read from a file
--code-prefix TLL           every course code beginning with the prefix
```

Multiple prefixes can be comma-separated, for example `--code-prefix TLL,TSL`. Multiple
selectors use union semantics across these commands: a course is included when it matches
any exact code from `--codes` or an explicit `--codes-file`, or any prefix. Duplicate codes
are removed case-insensitively when resolving download inputs.

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
An explicit `--codes-file` contributes all of its codes, even when inline codes or prefixes
are also supplied. Inline `--codes` alone are self-contained and do not read the default file.

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
data/schedule-cohorts.json              source cohort ownership of continuation sessions
```

The cohort index records explicitly assigned ownership of cross-term and pre-term
sessions. Regeneration preserves older mappings and replaces mappings for events
in the current input; it does not infer ownership from the first date or a course
code list. The scraper keeps its own tracked index at `data/schedule-cohorts.json`,
including historical mappings needed when a manifest covers only newer sources.
Commit it with schedule changes. Later completion sessions appear in
the later term's timetable without becoming new starting offerings; pre-term
sessions stay in their originating timetable. Override its output path with
`--cohorts-out`. Course filters restrict schedule JSON/SQL and the course-code list;
the cohort index covers all parsed source events so filtered runs preserve ownership
for the full source. To regenerate it from existing extracted CSVs without
reimporting the database, run from `scraper/`:

```bash
npm run generate:cohorts -- \
  --manifest data/input/schedules/manifest.json \
  --csv-dir data/output/schedules/extracted-csv
```

To regenerate SQL from existing parsed JSON:

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

The report includes availability, download status, and input state for each variant:

```text
course_code    daytime    evening    daytime_status    evening_status    daytime_input_state    evening_input_state
```

A tick/check means that version was downloaded or accepted from the local cache.
Input states are `fresh` (downloaded this run), `cached` (valid local PDF accepted
without `--force`), `stale` (retained after a failed refresh), `missing` (no course
PDF available), and `failed` (download failed with no retained input).

Missing responses, including HTTP 404/410 and the endpoint's No Record Found
responses, remove any existing target PDF. PDFs under 5 KB are classified as
missing only when their extracted text contains only No Record Found; otherwise
they are failed refreshes. Network errors, server errors, unverified small PDFs,
and unexpected HTML retain the old PDF as `stale` and exclude it from manifest-based
parsing. Download failures return a non-zero exit status after writing the reports.
The interactive course refresh stops before parsing when a download fails.

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

## 9. Parse course synopsis PDFs

Run:

```bash
npm run parse:courses -- \
  --download-manifest data/output/courses/downloads.json \
  --pdf-dir data/input/courses \
  --codes-file data/output/schedules/course-codes.txt \
  --out data/output/courses/course-details.sql \
  --json data/output/courses/course-details.json \
  --issues-out data/output/courses/parse-issues.tsv
```

`--download-manifest` makes the current download run the source of truth: only
`downloaded` and `skipped` course variants are parsed, using their recorded PDF
paths. Paths in new manifests are absolute; relative paths in older manifests
resolve from the command's working directory. Course filters can further restrict
these accepted entries. Stale, missing, and failed entries appear in the parse
issues report. Failed downloads also make this parse command return non-zero,
even when it writes partial output from accepted inputs. An empty manifest never
falls back to scanning the PDF directory.

The interactive workflow always passes this manifest. Omit `--download-manifest`
only for a standalone parse of manually selected local PDFs; directory scanning
does not establish whether those files were refreshed successfully.

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

Course-code extraction does not establish that a prerequisite was fully parsed. The
parser removes recognized course references, completion wording, and connectors from a
normalized copy and checks the remaining text. Residual conditions are retained as
`condition` nodes and set `parseStatus` to `review_required`. Recognized condition tags
cover placement tests, prior learning, experience, credit-unit requirements, programme
standing, and co-enrollment. These tags support review rather than automatic eligibility
checks; unfamiliar conditions also require review. The original text remains in `rawText`
and the condition's `sourceText`, and the issue report includes the residual wording and
source page. Only fully represented course-only rules use `parsed`.

Self-references are excluded from prerequisite rules and edges and produce a
`review_required` issue. Co-enrollment wording (including "at the same time") is retained
as a condition with its full source text and emits no prerequisite edges. Passages mixing
completion and co-enrollment requirements remain entirely under review until their clause
scope can be established. SQL generation also rejects self-dependencies in rule nodes or
edges before producing an import.

Run the curriculum prerequisite regression tests with the Python virtual environment
activated:

```bash
npm run test:curriculum
```

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

The report identifies each course, schedule type, severity, and issue. Look for
missing names or synopsis sections, missing assessments, weights that do not
total 100, and PDFs containing `No Record Found`.

If assessment weights do not total 100, the parser skips assessment rows for that
course and schedule type. Inspect the PDF and warnings before importing.

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

After setting `DATABASE_URL`, the equivalent low-level sequence for a fresh database
is below. Start at the repository root; if already inside `scraper/`, omit `cd scraper`:

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
  --download-manifest data/output/courses/downloads.json \
  --out data/output/courses/course-details.sql \
  --json data/output/courses/course-details.json \
  --issues-out data/output/courses/parse-issues.tsv
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f data/output/courses/course-details.sql
```

After importing and reviewing schedules, enable
[intake schedule availability](#intake-schedule-availability) before publishing snapshots.

This is the normal application import path. It deliberately excludes
`curriculum-schema-extension.sql` and `curriculum-plans.sql`. Use the isolated evaluation
steps in section 9A for curriculum data; do not add those files to the shared or production
import sequence while the model remains preliminary.

### Publish the imported data to the application

The production application serves build-time JSON snapshots and does not query
Postgres during user requests. After verifying the import, enable
`semesters.has_intake_schedule` for the validated intakes as described above,
then publish the reviewed cohort index to the application's `data/` directory.
This explicit file handoff is required after either `scrape:all` or
`generate:cohorts`; scraper commands do not update the application's copy.
From `scraper/` in this repository:

```bash
npm test
npm run typecheck
cp data/schedule-cohorts.json ../data/schedule-cohorts.json
cd ..
npm run data:build
npm test
npm run typecheck
```

If the scraper lives elsewhere, copy its reviewed `data/schedule-cohorts.json`
to the web application's `data/schedule-cohorts.json` instead. Commit both copies
when maintaining them in this repository.

Review the generated counts, then trigger a new Vercel deployment. Vercel runs
the same snapshot generator during `prebuild`, so database-only updates do not
require committing generated JSON. See
[Data Snapshot Operations](../docs/DataSnapshots.md) for publication and rollback.

## 14. Validate scraper changes

From the repository root, validate TypeScript, Python syntax, dependency consistency, and
the working-tree diff:

```bash
npm test
npm run typecheck
npm --prefix scraper test
npm --prefix scraper run typecheck
scraper/venv/bin/python -m py_compile scraper/tools/*.py
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

### Parser creates null course names

Course upserts preserve an existing name when the parsed name is null. Check the
issues TSV for name-extraction warnings and inspect the source PDF.

### Course PDF says `No Record Found`

The endpoint returned a PDF with no course record. The parser skips it.

### Assessment total not 100

PDF table extraction or page breaks can corrupt assessment weights. The parser
strips footers and carries OCAS/OES state across pages; inspect the source PDF
if the total is still incorrect.

## 16. Data model

The schema separates catalog data from semester-specific schedules:

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
