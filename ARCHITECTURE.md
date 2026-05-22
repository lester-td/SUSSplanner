# Architecture

## Scope

This repository has two workspaces:

- root app: Next.js timetable planner (`app/`, `components/`, `lib/`)
- scraper pipeline: local data ingestion workflow (`scraper/`)

This document covers the root web app architecture.

## System Overview

The app has two runtime objectives:

1. Read timetable/course data from an existing Supabase Postgres schema.
2. Let anonymous users build, share, and export timetables from URL + local browser state.

There is no server-side user timetable persistence in this design.

## Runtime Topology

### Server runtime (Node.js)

- Next.js App Router pages and route handlers execute on the server.
- `DATABASE_URL` is read only on the server.
- DB reads are performed via Drizzle + `postgres` driver.

### Browser runtime

- `PlannerClient` and `ShareClient` manage interactive state.
- Planner state persists in `localStorage`.
- PNG export is client-side DOM capture.

### Database

- Existing Supabase Postgres schema is the source of truth.
- This rewrite is read-focused for planner runtime operations.

## Data Model Contract

The app expects these relations:

- `courses`
- `semesters`
- `semester_weeks`
- `classes`
- `class_events`
- `assessment_components`
- `v_class_events_with_week` (read-only view used for timetable expansion by week)

Key business identifiers:

- course-level identity: `course_code`
- class-level share identity: `course_code + schedule_type + group_code_type + group_code`
- timetable URL identity: semantic class identifiers, not raw `class_id`

## Data Access Layer

Primary files:

- `lib/db/index.ts`
- `lib/db/schema.ts`
- `lib/db/queries.ts`

Rules and behaviors:

- `lib/db/index.ts` throws immediately if `DATABASE_URL` is missing.
- A shared `postgres` client is reused in development (`globalThis.__sussplanner_sql_client__`) to avoid connection churn during hot reload.
- Query functions are centralized in `lib/db/queries.ts`; UI code does not query DB directly.
- All timetable assembly paths resolve through `getTimetableDataFromClassIdentifiers(...)` or `getTimetableDataFromClassIds(...)`.
- `v_class_events_with_week` rows are validated for required fields before mapping.

## Routing And Page Data Flow

### `/` and `/timetable`

- `app/page.tsx` re-exports `/timetable`.
- `app/timetable/page.tsx` loads:
  - `getSemestersWithClassesAndWeeks()`
  - current semester/week context from date utilities
- `PlannerClient` then performs client fetches to `/api/classes` using encoded share query state.
- `app/planner/page.tsx` loads the semester planner UI via `StudyPlanClient`.

### `/courses`

- Server fetches:
  - semester list
  - semester-week tree
  - search facets (`schools`, `courseLevels`)
- Initial filter state is parsed from URL query params.
- `CourseSearchPage` performs live search via `/api/courses/search`.

### `/courses/[courseCode]`

- Server fetches:
  - course metadata
  - classes (optional `semesterId`)
  - assessment components
  - offered semesters
- Missing course returns Next.js `notFound()`.
- Client-side semester dropdown re-fetches class groups via `/api/classes?courseCode=...`.

### `/share`

- If no share params: renders an empty-state explainer.
- If malformed params: renders invalid-link UI.
- If valid params:
  - decode `sem` and `classes`
  - resolve identifiers to classes/events
  - render read-only shared timetable in `ShareClient`
- Importing from this page explicitly overwrites local planner selection state.

## API Surface

All route handlers use `runtime = "nodejs"` and are currently `GET` only.

- `/api/courses/search`
  - parses multi-value search/filter query params
  - returns `{ courses }`

- `/api/courses/[courseCode]`
  - validates optional `semesterId`, `scheduleType`
  - returns `{ course, classes, assessmentComponents }` or `404`

- `/api/classes`
  - Mode A: class group lookup by `courseCode`
  - Mode B: timetable assembly from share payload (`sem`, `classes`)
  - returns `{ classes }` or `{ timetable }`

- `/api/export/ics`
  - resolves timetable from share payload
  - returns downloadable ICS file

- `/api/export/pdf`
  - resolves timetable from share payload
  - returns downloadable PDF file

No `/api/export/png` route exists; PNG is generated client-side from rendered UI.

## Share URL Architecture

Share state is stateless and URL-based:

```text
/share?sem=<semesterId>&classes=<courseCode:scheduleType:groupCodeType:groupCode>,...
```

Validation is enforced by Zod schemas:

- `semesterId` must be a positive integer
- `scheduleType` must be `daytime` or `evening`
- `groupCodeType` must be `TG` or `CRN`
- max `50` selected classes per shared payload

Resolution flow:

1. Parse and validate URL payload.
2. Match semantic identifiers to `classes` within selected semester.
3. Build timetable from matching class IDs.
4. Return non-matching identifiers in `unresolvedSelections` (do not mutate DB or silently drop in UI).

## Local State Architecture

Storage key:

- `sussplanner.timetable.v1`

Persisted fields:

- `semesterId`
- `selectedClasses`
- `hiddenClasses`
- `selectedWeekId`
- `orientation`
- `viewMode`

Import behavior from `/share`:

- selected shared classes replace current selected classes
- `hiddenClasses` resets to empty
- orientation/view mode are preserved from existing saved state when present

## Export Architecture

### ICS (`lib/export/ics.ts`)

- Built server-side from resolved timetable events.
- Emits `VEVENT`s with `Asia/Singapore` timezone in `DTSTART/DTEND`.

### PDF (`lib/export/pdf.ts`)

- Built server-side with `pdf-lib`.
- Includes semester header, generation timestamp, clash summary, and event list.

### PNG (`lib/export/png.ts`)

- Built client-side with `html-to-image` from current rendered timetable container.
- Preserves current visual state (orientation, filtered week, selected view).
