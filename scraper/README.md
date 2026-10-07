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

### Schema: schedule metadata and announcements

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
The timetable keeps active continuation destinations accessible with unchanged
rail labels and shows a notice in the existing timetable info section, alongside
Week 0 and Study Week classes, with the same dismissal behavior. Course snapshots
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
    semester-weeks.2027.json
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

The current combined PDF needs one entry:

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

Older separate files still support `"scheduleType": "daytime"` or
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
  --out data/output/schedule-import.sql \
  --json data/output/schedule-parsed.json
```

`--schedule-type` is optional and defaults to `auto`. The batch importer and
cohort generator use the same manifest and classification rules.

---

## 6. Generate and import semester weeks

The 2027 manifest is `data/input/semester-weeks.2027.json`; the 2026 manifest
remains available for older intakes. The 2027 dates follow the supplied academic
calendar:

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
  --input data/input/semester-weeks.2027.json \
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
../data/schedule-cohorts.json         source cohort ownership of continuation sessions
```

The cohort index records explicitly assigned ownership of cross-term and pre-term
sessions. Regeneration preserves older mappings and replaces mappings for events
in the current input; it does not infer ownership from the first date or a course
code list. Commit it with schedule changes. Later completion sessions appear in
the later term's timetable without becoming new starting offerings; pre-term
sessions stay in their originating timetable. Override its output path with
`--cohorts-out`. To regenerate it from existing extracted CSVs without
reimporting the database, run from `scraper/`:

```bash
npm run generate:cohorts -- \
  --manifest data/input/schedule-manifest.json \
  --csv-dir data/output/schedules/extracted-csv
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
  --input data/input/semester-weeks.2027.json \
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

### Publish the imported data to the application

The production application serves build-time JSON snapshots and does not query
Postgres during user requests. After verifying the import, enable
`semesters.has_intake_schedule` for the validated intakes as described above,
then return to the repository root and run:

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
