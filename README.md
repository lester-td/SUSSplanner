# SUSS Planner

SUSS Planner is a full-stack timetable planner for SUSS students. It is built on Next.js App Router and reads directly from an existing Supabase Postgres schema via Drizzle.

This repo contains:

- the web app (`/`)
- a local scraping/import pipeline (`/scraper`) for updating academic data

## What This App Does

- Lets users build a timetable from class groups by semester
- Detects timetable clashes from real dated events
- Supports read-only shared links with optional one-click import into local state
- Exports selected timetable data as PDF, ICS, or PNG
- Stores planner state in browser `localStorage` (no user auth required)

## Tech Stack

### Web app (`/`)

- Next.js 16 (App Router + Route Handlers)
- React 19
- TypeScript
- Drizzle ORM + `postgres` driver
- Supabase Postgres (via `DATABASE_URL`)
- Tailwind CSS v4
- Zod
- `pdf-lib` (PDF export)
- `html-to-image` (client-side PNG export)

### Scraper (`/scraper`)

- Node.js + TypeScript CLI scripts
- Python (`pdfplumber`) for PDF extraction helpers
- SQL generation for `psql`/Supabase import

## Repository Layout

```text
app/                    Next.js routes (pages + API route handlers)
components/             UI components
lib/db/                 Drizzle client, schema, queries
lib/timetable/          Timetable domain logic (share URL, clash detection, storage)
lib/export/             ICS/PDF/PNG export logic
lib/validation/         Zod schemas
drizzle/                Intentionally empty for this rewrite (no destructive migrations)
scraper/                Local data scraping + SQL generation workflow
```

## Prerequisites

- Node.js (current LTS recommended)
- npm
- A Postgres connection string (Supabase or compatible) with the expected schema/data

Optional for scraper workflow:

- Python 3.10+
- `psql`

## Environment Variables

Create `.env.local` in repo root:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
CACHE_REVALIDATE_SECRET=
```

Notes:

- `DATABASE_URL` is required and used server-side by the app and Drizzle config.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are currently not required by runtime code, but are kept for compatibility/future browser integrations.
- `CACHE_REVALIDATE_SECRET` secures the on-demand cache invalidation endpoint used after DB refreshes/imports.
- Never commit real credentials.

## Install And Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run typecheck   # TypeScript checks
npm run build       # Production build
npm run start       # Run production build locally
npm run db:generate # Generate Drizzle migration files (only when you intentionally change schema)
```

Important:

- The current architecture assumes the existing Supabase academic tables already exist.
- Do not run `drizzle-kit push` against production/shared Supabase unless you explicitly intend schema changes.

## App Routes

### Pages

- `/` -> renders the same page as `/timetable` (`app/page.tsx` re-export)
- `/timetable` -> interactive timetable planner
- `/planner` -> semester planner
- `/courses` -> course search page with filters
- `/courses/[courseCode]` -> course detail page; optional query `semesterId`
- `/share` -> shared timetable preview/import page
  - expected query params: `sem`, `classes`

### API Routes

All current API routes run on Node.js runtime. Most are `GET`; cache invalidation uses `POST`.

1. `/api/courses/search`
- Query params:
  - `q`
  - `semesterIds` (repeatable) or `semesterId`
  - `scheduleTypes` (repeatable) or `scheduleType` (`daytime` | `evening`)
  - `postgraduateOnly` or legacy `postgraduate=postgraduate`
  - `availableAsGspOnly`
  - `schools` (repeatable) or `school`
  - `courseLevels` (repeatable) or `courseLevel`
  - `limit` (default `25`, max `100`)
- Response:
  - `{ courses: CourseSearchResult[] }`

2. `/api/courses/[courseCode]`
- Query params:
  - `semesterId` (optional)
  - `scheduleType` (optional: `daytime` | `evening`)
- Response:
  - `{ course, classes, assessmentComponents }`
- Error:
  - `404` when course code is not found

3. `/api/classes`
- Mode A (course group lookup):
  - Query: `courseCode` + optional `semesterId`/`sem`, `scheduleType`
  - Response: `{ classes: CourseClassRecord[] }`
- Mode B (timetable resolution from share params):
  - Query: `sem` + `classes`
  - Response: `{ timetable: TimetableData }`

4. `/api/cache/revalidate`
- Method: `POST`
- Headers:
  - `x-revalidate-secret: <CACHE_REVALIDATE_SECRET>` or `Authorization: Bearer <CACHE_REVALIDATE_SECRET>`
- JSON body:
  - `tags?: string[]` (`semesters`, `semester-weeks`, `classes`, `courses`, `assessments`)
  - `paths?: string[]`
- Behavior:
  - Revalidates the provided cache tags; if `tags` is omitted, all known tags are revalidated.
  - Optional `paths` can also be revalidated when you want to clear route-level caches alongside data caches.
- Example: revalidate all known tags

```bash
curl -X POST http://localhost:3000/api/cache/revalidate \
  -H "x-revalidate-secret: $CACHE_REVALIDATE_SECRET" \
  -H "content-type: application/json" \
  -d '{}'
```

- Example: revalidate only class and course data after a schedules import

```bash
curl -X POST http://localhost:3000/api/cache/revalidate \
  -H "x-revalidate-secret: $CACHE_REVALIDATE_SECRET" \
  -H "content-type: application/json" \
  -d '{"tags":["classes","courses","assessments"]}'
```

- Example: revalidate tags and route paths together

```bash
curl -X POST http://localhost:3000/api/cache/revalidate \
  -H "x-revalidate-secret: $CACHE_REVALIDATE_SECRET" \
  -H "content-type: application/json" \
  -d '{"tags":["semesters","semester-weeks","classes"],"paths":["/","/planner","/timetable"]}'
```

5. `/api/export/ics`
- Query: share params (`sem`, `classes`)
- Response: calendar attachment (`text/calendar`)

6. `/api/export/pdf`
- Query: share params (`sem`, `classes`)
- Response: PDF attachment (`application/pdf`)

PNG export is intentionally client-side (no `/api/export/png`) to preserve the rendered UI view.

## Share URL Format

Share URLs are stateless and encode selected classes semantically.

Format:

```text
/share?sem=<semesterId>&classes=<identifier>,<identifier>,...
```

Class identifier format:

```text
COURSECODE:scheduleType:groupCodeType:groupCode
```

Example:

```text
/share?sem=1&classes=ICT133:evening:TG:T01,ANL252:daytime:CRN:12345
```

Validation constraints:

- `scheduleType`: `daytime` | `evening`
- `groupCodeType`: `TG` | `CRN`
- up to 50 selected class identifiers in one shared payload

If a shared identifier no longer maps to current DB rows, it is returned in `unresolvedSelections` and surfaced in the UI.

## Local State Persistence

Planner state is stored in browser `localStorage` under:

```text
sussplanner.timetable.v1
```

Persisted fields:

- `semesterId`
- `selectedClasses`
- `hiddenClasses`
- `selectedWeekId`
- `orientation`
- `viewMode`

Shared links do not auto-overwrite local state. Overwrite only happens after explicit import confirmation in `/share`.

## Database And Schema Expectations

The app expects these tables/views (read path):

- `courses`
- `semesters`
- `semester_weeks`
- `classes`
- `class_events`
- `assessment_components`
- `v_class_events_with_week` (treated as read-only)

`lib/db/schema.ts` mirrors this schema manually. This rewrite intentionally avoids destructive migration workflows for core academic tables.

## Scraper Workflow

The scraper is a separate local workflow under [`scraper/`](./scraper):

```bash
cd scraper
npm install
```

See [`scraper/README.md`](./scraper/README.md) for:

- schedule PDF parsing
- course synopsis PDF download/parsing
- semester week SQL generation
- import order and validation checks

## License

MIT (see [`LICENSE`](./LICENSE)).
