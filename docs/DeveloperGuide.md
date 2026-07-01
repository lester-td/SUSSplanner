# SUSSPlanner Developer Guide

This guide is an onboarding reference for developers working on SUSSPlanner. It
describes the architecture and workflows that are verifiable in this repository.
Where the intended production process is not represented in code, it is called
out under [Assumptions / Gaps](#assumptions--gaps).

## Project Overview

SUSSPlanner is a student-built academic planning platform with five main
anonymous-user capabilities:

1. Build a semester timetable from SUSS course class groups, inspect clashes,
   switch between class and exam views, and export the result.
2. Search the course catalog and inspect course details, class schedules, and
   assessment components.
3. Build a multi-semester course plan using catalog courses or manually entered
   courses, export/import a restorable JSON backup, and open an A4 print view
   for saving as PDF.
4. Calculate current and cumulative GPA from catalog or custom modules and
   compare current-semester Pass/Fail strategies.
5. Configure local appearance/timetable defaults and show in-app course
   registration reminders for bundled eCR and add-drop windows.

Normal users do not have accounts. Timetable, semester planner, GPA-calculator,
settings, and course-registration reminder interaction state are stored in
browser `localStorage`. Semester planners can additionally be backed up to and
restored from a local JSON file, or opened as an A4 print view for saving as
PDF. A timetable can be shared through a semantic URL that contains a semester
ID and selected class identifiers. The shared page remains read-only until the
recipient explicitly imports it into their local timetable.

The repository contains two cooperating workspaces:

- **Web application:** the root Next.js application in `app/`, `components/`,
  and `lib/`.
- **Data ingestion pipeline:** the local Node.js, TypeScript, and Python scraper
  in `scraper/`, which produces SQL for import into Postgres.

The web application reads academic data from Postgres. It does not write user
planner state or academic data to the database.

## System Architecture

### System Architecture Diagram

```mermaid
flowchart LR
    User["Anonymous student"]
    Maintainer["Maintainer / data operator"]
    Browser["Browser<br/>React client components"]
    LocalStorage["Browser localStorage<br/>timetable + semester planner + GPA calculator + settings"]
    ReminderState["Reminder interaction state<br/>dismissed reminder IDs"]
    RegistrationSchedule["Bundled registration schedule<br/>lib/registration/schedule.ts"]
    ReminderBanner["Course registration reminder banner<br/>Planner page"]
    SemesterPlannerBackup["Semester-planner JSON backup<br/>local file"]
    SemesterPlannerPrint["A4 semester-planner print view<br/>Blob URL in new tab"]
    ShareURL["Share URL<br/>sem + semantic class identifiers"]
    NextPages["Next.js App Router pages<br/>server components"]
    API["Next.js route handlers<br/>Node.js runtime"]
    DAL["Data access layer<br/>lib/db/queries.ts"]
    Cache["Next.js data cache<br/>selected tagged lookups"]
    DB["Supabase-compatible Postgres<br/>academic data"]
    Sources["Schedule PDFs + course synopsis PDFs<br/>semester-week JSON"]
    Scraper["Local scraper pipeline<br/>Node.js + TypeScript + Python"]
    SQL["Generated JSON, reports, and SQL"]
    Revalidate["POST /api/cache/revalidate"]

    User --> Browser
    Browser --> LocalStorage
    LocalStorage --> Browser
    Browser --> ReminderState
    ReminderState --> Browser
    RegistrationSchedule --> Browser
    Browser --> ReminderBanner
    Browser --> SemesterPlannerBackup
    SemesterPlannerBackup --> Browser
    Browser --> SemesterPlannerPrint
    Browser --> NextPages
    Browser --> ShareURL
    ShareURL --> NextPages
    Browser --> API
    NextPages --> DAL
    API --> DAL
    DAL --> Cache
    Cache --> DAL
    DAL --> DB

    Maintainer --> Scraper
    Sources --> Scraper
    Scraper --> SQL
    Maintainer -->|"psql with DATABASE_URL"| DB
    Maintainer -->|"CACHE_REVALIDATE_SECRET"| Revalidate
    Revalidate --> Cache
```

### Runtime Boundaries

| Boundary | Responsibilities | Key files |
|---|---|---|
| Browser | Interactive timetable, course search UI, semester planner, GPA calculator, settings, in-app registration reminders, `localStorage`, JSON plan backup/restore, rendered timetable PNG/PDF export, A4 semester-planner print view | `components/`, `lib/timetable/local-storage.ts`, `lib/planner/storage.ts`, `lib/settings/app-settings.ts`, `lib/registration/`, `components/calculator/gpa-calculator-client.tsx`, `lib/export/png.ts`, `lib/export/pdf-client.ts`, `lib/export/semester-planner-print.ts` |
| Next.js server | Server-rendered pages, validation, API route handlers, server-side ICS/PDF endpoints | `app/`, `lib/validation/`, `lib/export/ics.ts`, `lib/export/pdf.ts` |
| Data access layer | Centralized Drizzle queries, timetable assembly, clash detection, cached lookups | `lib/db/queries.ts`, `lib/db/index.ts`, `lib/timetable/clash-detection.ts` |
| Postgres | Source of truth for academic catalog, semester, class, event, and assessment data | `scraper/schema.sql`, mirrored by `lib/db/schema.ts` |
| Local scraper | Extracts source PDFs, creates review artifacts, and generates transactional SQL | `scraper/src/`, `scraper/tools/` |

### Architectural Rules Visible in the Code

- UI components do not query Postgres directly; database access is centralized
  in `lib/db/queries.ts`.
- `DATABASE_URL` is read by the server-side database client, Drizzle tooling,
  and the setup validator; maintainers also pass it to `psql`.
- Anonymous user state is not persisted server-side.
- App settings and course-registration reminder dismissals are local browser
  preferences; they are not persisted server-side.
- Share URLs use semantic class identifiers instead of database `class_id`
  values, making links independent of raw surrogate IDs.
- The application runtime is read-only with respect to academic tables.
- Data updates happen outside the deployed app through generated SQL and
  `psql`.
- Selected semester/week/facet lookup queries use Next.js `unstable_cache` with a ten-minute
  revalidation period and cache tags.

## Tech Stack

### Web Application

| Area | Technology |
|---|---|
| Framework | Next.js 16 App Router |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS 4 through PostCSS, plus CSS variables in `app/globals.css` |
| Database access | Drizzle ORM 0.44 and `postgres` driver |
| Database | Supabase-compatible PostgreSQL |
| Validation | Zod 4 |
| Server PDF generation | `pdf-lib` |
| Browser image/PDF export | `html-to-image` and `pdf-lib` |
| Semester-planner backup and print export | Browser `Blob`/object URLs, native print dialog, and Zod validation |
| Settings and registration reminders | Browser `localStorage`, validated preference normalization, bundled registration-event data |
| Icons | `react-icons` |
| Hosting configuration | Vercel, Singapore region (`sin1`) |

### Scraper

| Area | Technology |
|---|---|
| Main runtime | Node.js with TypeScript executed by `tsx` |
| Schedule/course parsing | TypeScript parsers in `scraper/src/parsers/` |
| PDF extraction helpers | Python 3 with `pdfplumber` |
| Review/import artifacts | JSON, TSV, CSV, and generated SQL |
| Database import | `psql` |

### Supported Tool Versions

The root `package.json` declares:

- Node.js `>=20`
- npm `>=10`

The setup validator rejects Node.js below 20 but only warns for npm below 10.
The scraper README recommends Node.js 18+, Python 3.10+, and `psql`.

## Repository Structure

```text
.
├── app/                         Next.js pages and API route handlers
│   ├── api/                     JSON, export, and cache-revalidation routes
│   ├── calculators/             GPA and OCAS calculator page
│   ├── courses/                 Course search and detail pages
│   ├── planner/                 Multi-semester semester planner page
│   ├── share/                   Read-only shared timetable page
│   ├── settings/                Local app settings page
│   └── timetable/               Interactive timetable page
├── components/
│   ├── calculator/              GPA calculator client UI and browser-local state
│   ├── courses/                 Course search/detail client components
│   ├── layout/                  Shared application shell and navigation
│   ├── planner/                 Semester planner UI, add button, and shared icons
│   │   └── semester-planner/    Client, panel, drag/drop, and formatting helpers
│   ├── registration/            Course-registration reminder banner
│   ├── settings/                Settings UI and settings provider
│   ├── timetable/               Timetable, exam, selection, and share UI
│   └── ui/                      Reusable actions and modal
├── lib/
│   ├── db/                      Drizzle client, schema mirror, and queries
│   ├── export/                  ICS, server PDF, browser PNG/PDF, and semester-planner print helpers
│   ├── planner/                 Semester-planner types and local persistence
│   ├── registration/            Registration schedule, reminder timing, storage, validation, and tests
│   ├── settings/                App settings defaults, migration, storage, and update event helpers
│   ├── timetable/               Domain types, URL encoding, storage, utilities
│   └── validation/              Zod schemas
├── drizzle/                     Intentionally empty migration-output directory
├── scraper/
│   ├── data/input/              Tracked source manifests and source PDFs
│   ├── src/cli/                 Scraper command entry points
│   ├── src/parsers/             Schedule and course-detail parsers
│   ├── src/sql/                 SQL generation
│   ├── tools/                   Python PDF extraction helpers
│   └── schema.sql               Complete database DDL used by scraper setup
├── scripts/validate-project.mjs Environment and toolchain validation
├── ARCHITECTURE.md              Existing shorter architecture summary
├── README.md                    Project overview and quick reference
├── drizzle.config.ts            Drizzle Kit configuration
├── next.config.js               Allowed development origins
└── vercel.json                  Vercel region configuration
```

`frontend/react/` currently contains only a `.gitignore` and is not part of the
application runtime.

## Setup Instructions

### Web Application Setup

1. Install Node.js 20+ and npm 10+.
2. Install root dependencies:

   ```bash
   npm install
   ```

3. Create local environment configuration:

   ```bash
   cp .env.example .env.local
   ```

4. Set a valid `DATABASE_URL` for a Postgres database containing the
   expected schema and data.
5. Validate setup:

   ```bash
   npm run validate:setup
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

`npm run dev`, `npm run build`, and `npm run start` automatically run their
corresponding validation scripts first.

### Scraper Setup

From `scraper/`:

```bash
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

The scraper needs `psql` only when importing generated SQL or running database
checks. It needs network access when downloading current course synopsis PDFs.

### Verification Commands

The root app has a Vitest suite for registration reminders and settings
normalization, plus TypeScript and production-build checks:

```bash
npm test
npm test -- lib/registration/reminders.test.ts
npm run typecheck
npm run build

cd scraper
npm run typecheck
```

### Development Commands

| Command | Purpose |
|---|---|
| `npm run validate:setup` | Validate first-run dependencies and local environment configuration. |
| `npm run validate:dev` | Run the validation used automatically before `npm run dev`. |
| `npm run validate:build` | Run the validation used automatically before `npm run build`. |
| `npm run validate:start` | Run the validation used automatically before `npm run start`. |
| `npm run dev` | Start the Next.js development server. |
| `npm test` | Run the root Vitest suite. |
| `npm run typecheck` | Run root TypeScript checks without emitting files. |
| `npm run build` | Create a production build. |
| `npm run start` | Run the production build locally. |
| `npm run db:generate` | Generate Drizzle migration files after an intentional schema change. |

The setup validator checks supported Node/npm versions, installed dependencies,
local environment files, and the shape of `DATABASE_URL`. It also warns about
missing optional Supabase public variables and the cache-revalidation secret.

The application assumes that the academic database schema already exists. Do
not run `drizzle-kit push` against a shared or production database unless the
schema change is intentional and reviewed.

## Environment Variables

The root `.env.example` defines the complete documented environment surface:

| Variable | Required | Used by | Notes |
|---|---:|---|---|
| `DATABASE_URL` | Yes for app runtime and database tooling | `lib/db/index.ts`, `drizzle.config.ts`, setup validator, maintainer `psql` commands | Must be a `postgres://` or `postgresql://` URL. Keep server-side and secret. |
| `CACHE_REVALIDATE_SECRET` | Required only to enable cache revalidation endpoint | `app/api/cache/revalidate/route.ts` | Accepted through `x-revalidate-secret` or `Authorization: Bearer ...`. |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Setup validator only | Present for compatibility/future browser integrations; not used by runtime application code. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Setup validator only | Present for compatibility/future browser integrations; not used by runtime application code. |
| `NEXT_ALLOWED_DEV_ORIGINS` | No | `next.config.js`, setup validator | Comma-separated extra hostnames or HTTP(S) origins allowed during development. |

Never commit `.env.local` or real credentials. `.gitignore` excludes local
environment files except `.env.example`.

## Database and Schema

`scraper/schema.sql` is the most complete database definition in the repository.
`lib/db/schema.ts` manually mirrors the tables and read-only view for Drizzle
queries. The project does not maintain migrations for the existing academic
tables; `drizzle/README.md` says the migration directory is intentionally empty.

### Entity Relationship Diagram

```mermaid
erDiagram
    COURSES {
        varchar course_code PK
        varchar course_name
        varchar school_name
        boolean is_postgraduate
        varchar course_level
        numeric credit_units
        text presentation_pattern
        text course_synopsis
        jsonb course_topics
        jsonb learning_outcomes
        text synopsis_url
        timestamptz last_scraped_at
        timestamptz last_updated
    }

    SEMESTERS {
        bigint semester_id PK
        varchar academic_year
        smallint semester_no
        varchar semester_name
        timestamptz last_updated
    }

    SEMESTER_WEEKS {
        bigint week_id PK
        bigint semester_id FK
        smallint week_no
        varchar week_type
        varchar label
        date start_date
        date end_date
        timestamptz last_updated
    }

    CLASSES {
        bigint class_id PK
        varchar course_code FK
        bigint semester_id FK
        varchar schedule_type
        varchar group_code_type
        varchar group_code
        boolean available_as_gsp
        boolean is_restricted
        text remarks
        timestamptz last_updated
    }

    CLASS_EVENTS {
        bigint event_id PK
        bigint class_id FK
        varchar event_kind
        date event_date
        smallint day_of_week
        time start_time
        time end_time
        varchar event_mode
        varchar venue
        text remarks
        timestamptz last_updated
    }

    ASSESSMENT_COMPONENTS {
        bigint component_id PK
        varchar course_code FK
        varchar schedule_type
        varchar component_name
        varchar component_group
        varchar assessment_mode
        numeric weight_percentage
        integer sort_order
        timestamptz last_updated
    }

    COURSES ||--o{ CLASSES : offers
    SEMESTERS ||--o{ CLASSES : contains
    SEMESTERS ||--o{ SEMESTER_WEEKS : defines
    CLASSES ||--o{ CLASS_EVENTS : schedules
    COURSES ||--o{ ASSESSMENT_COMPONENTS : has
```

### Read-Only View

`v_class_events_with_week` joins `class_events` to `classes` and left-joins
`semester_weeks` when an event date falls within a semester-week date range.
Most class/timetable query paths read this view so events already carry course,
class-group, semester, and optional week information.

### Important Constraints

- `semesters` is unique by `(academic_year, semester_no)`.
- `semester_weeks` is unique by semester/week number, label, and date range.
- `classes` is unique by
  `(course_code, semester_id, schedule_type, group_code_type, group_code)`.
- `class_events` is unique by
  `(class_id, event_kind, event_date, start_time, end_time)`.
- `assessment_components` is unique by
  `(course_code, schedule_type, sort_order)`.
- `schedule_type` is `daytime` or `evening`.
- `group_code_type` is `TG` or `CRN`.
- `event_kind` is `CLASS`, `EXAM`, or `OTHER`.
- `week_type` is `TEACHING`, `STUDY`, or `EXAM`.
- `assessment_components` is intentionally not semester-specific because the
  source synopsis endpoint exposes only the latest/current assessment strategy.

### Database Access Behavior

- `lib/db/index.ts` fails immediately when `DATABASE_URL` is missing.
- The `postgres` client uses `prepare: false`, up to 3 connections in
  production, and up to 10 in development.
- Development reuses the client through `globalThis` to reduce hot-reload
  connection churn.
- Timetable assembly resolves semantic identifiers to matching class IDs, loads
  events and semester data, derives ECA markers, detects clashes, and returns
  unresolved identifiers without silently removing them from the response.

## Frontend Routes and Pages

| Route | Rendering and behavior |
|---|---|
| `/` | Static home page with links to Timetable, Courses, Planner, Calculators, and placeholder school portal shortcuts. |
| `/timetable` | Server-loads semesters with classes/weeks, then `PlannerClient` restores local state and fetches timetable/course/class data interactively. |
| `/planner` | Server-loads semester metadata, then `SemesterPlannerClient` manages a browser-local multi-semester course plan, JSON backup/restore, and A4 print/PDF view. |
| `/calculators` | Force-dynamic, `noindex` page. Server-loads semester/week metadata for `AppShell`; `GpaCalculatorClient` and `OcasCalculatorClient` manage browser-local GPA calculation and OCAS assessment simulation. |
| `/settings` | Server-loads semester/week metadata for `AppShell`, then `SettingsClient` manages browser-local colour-scheme, theme, timetable-orientation, and course-registration reminder preferences. |
| `/courses` | Server-loads semesters, weeks, and search facets; `CourseSearchPage` fetches the full catalog, caches it in memory for return navigation, refreshes stale cached data after 15 minutes, filters/searches the cached catalog client-side, and paginates results at 10 courses per page. |
| `/courses/[courseCode]` | Server-loads course details, assessments, offered semesters, and optional selected-semester classes. Returns Next.js `notFound()` for an unknown course. |
| `/share?sem=...&classes=...` | Validates and resolves the shared timetable on the server, then renders a read-only `ShareClient` with explicit import. Missing or malformed parameters get explanatory UI. |

The shared `AppShell` provides navigation to Home, Timetable, Courses, Planner,
Calculators, and Settings. `/share` is reached through a share URL.

## API and Backend Routes

All route handlers explicitly use the Node.js runtime.

| Method and route | Inputs | Response / purpose |
|---|---|---|
| `GET /api/courses/search` | `q`; repeatable `semesterIds`; repeatable `scheduleTypes`; presence flags `undergraduateOnly`, `postgraduateOnly`, `availableAsGspOnly`; repeatable `assessmentModes` (`TMA`, `GBA`, `Quiz`, `ECA`, `Written Exam`, `Proctored Online Exam`, `Online Exam`); repeatable `schools`; repeatable `courseLevels` | `{ courses: CourseSearchResult[] }`; searches code, name, school, and synopsis and returns class counts, offered semesters, and lightweight filter metadata. |
| `GET /api/calculator/courses` | `q` | `{ courses: { courseCode, courseName, creditUnits }[] }`; searches the complete course catalog by code or name without joining classes or filtering by semester presentation. Returns up to 8 ranked results. |
| `GET /api/courses/[courseCode]` | Optional `semesterId`, optional `scheduleType` | `{ course, classes, assessmentComponents }`; returns `404` when the course is missing. |
| `GET /api/classes` | Mode A: `courseCode` plus optional `semesterId`/`sem` and `scheduleType` | `{ classes: CourseClassRecord[] }`; class groups and their events. |
| `GET /api/classes` | Mode B: share query `sem` plus optional comma-separated `classes` | `{ timetable: TimetableData }`; resolves selections, events, clashes, weeks, and unresolved selections. |
| `GET /api/classes/counts` | Required `semesterId`, comma-separated `courseCodes` | `{ counts }`; used to show whether selected courses have alternative class groups. |
| `GET /api/export/ics` | Required `sem`; optional `classes` list | Downloadable `text/calendar` attachment containing all resolved events in `Asia/Singapore` timezone. |
| `GET /api/export/pdf` | Required `sem`; optional `classes` list | Downloadable `application/pdf` event-list attachment with clash summary. The current timetable/share UI instead creates its PDF from a browser-rendered PNG. |
| `POST /api/cache/revalidate` | Secret header; JSON `{ tags?: string[], paths?: string[] }` | Revalidates known cache tags and optional paths. Defaults to all known tags when `tags` is omitted; malformed JSON bodies or empty/invalid `tags` arrays return `400`. |

PNG export is intentionally browser-side so it can preserve the rendered
timetable view; there is no `/api/export/png` route.

Semester-planner JSON backup/import and the A4 print view are also browser-only.
There are no semester planner export/import/print API routes, and semester planner data is
not sent to the server during these flows.

GPA calculations are browser-side. The calculator search API is the only
calculator request and returns the minimum catalog fields needed by the UI.

### Share URL Contract

```text
/share?sem=<positive-semester-id>[&classes=<identifier>,<identifier>,...]
```

Each class identifier is:

```text
COURSECODE:scheduleType:groupCodeType:groupCode
```

Example:

```text
/share?sem=1&classes=ICT133:evening:TG:T01,ANL252:daytime:CRN:12345
```

Zod validation in `lib/validation/timetable.ts` enforces:

- Positive integer semester ID.
- Course code containing 3-20 uppercase alphanumeric characters.
- `daytime` or `evening` schedule type.
- `TG` or `CRN` group-code type.
- Group code with no `:` or `,`.
- At most 50 selected classes.

## Authentication and Authorization

### Anonymous Users

There is no user authentication or account model in the web application.
Anonymous users can access all pages and all read/export API routes. Their
timetable, semester planner, and GPA-calculator data remains in their browser.

### Maintainer Controls

There is no admin page, admin session, role table, or login route in this
repository. The repository shows two operational access gates:

1. **Database update access:** a maintainer must possess a writable
   `DATABASE_URL` to import generated SQL with `psql`.
2. **Cache invalidation access:** `POST /api/cache/revalidate` requires an exact
   match with `CACHE_REVALIDATE_SECRET`, supplied through
   `x-revalidate-secret` or a Bearer authorization header.

The `NEXT_PUBLIC_SUPABASE_*` variables do not implement browser authentication
and are not used by runtime code.

### Use Case Diagram

Mermaid does not provide a dedicated UML use-case syntax, so this uses a
GitHub-renderable flowchart with actors and use cases.

```mermaid
flowchart LR
    Student["Anonymous student"]
    Maintainer["Maintainer / data operator"]

    subgraph PublicApp["Public SUSSPlanner application"]
        Build["Build timetable"]
        Resolve["Choose or switch class group"]
        Clash["Inspect timetable clashes"]
        Search["Search and inspect courses"]
        Study["Build multi-semester course plan"]
        GPA["Calculate GPA and compare Pass/Fail strategy"]
        Settings["Configure local settings and timetable defaults"]
        Reminders["Receive, dismiss, or snooze course registration reminders"]
        Backup["Export or import semester-planner JSON backup"]
        Print["Open A4 semester-planner print/PDF view"]
        Share["Create shared timetable URL"]
        Preview["Preview and explicitly import shared timetable"]
        Export["Export PNG, PDF, or ICS"]
    end

    subgraph Operations["Maintainer operations"]
        Parse["Parse source PDFs and semester-week JSON"]
        Review["Review generated JSON / TSV / SQL"]
        Import["Import academic data with psql"]
        Invalidate["Revalidate application caches"]
    end

    Student --> Build
    Student --> Resolve
    Student --> Clash
    Student --> Search
    Student --> Study
    Student --> GPA
    Student --> Settings
    Student --> Reminders
    Student --> Backup
    Student --> Print
    Student --> Share
    Student --> Preview
    Student --> Export

    Maintainer --> Parse
    Maintainer --> Review
    Maintainer --> Import
    Maintainer --> Invalidate
```

## Core User Flows

### Main User Flow Diagram

```mermaid
flowchart TD
    Open["Open / or /timetable"]
    Restore{"Valid saved timetable<br/>in localStorage?"}
    Default["Use current/first available semester<br/>and default UI state"]
    Saved["Restore semester, selections,<br/>hidden classes, colors, week, view"]
    HasSelections{"Selected classes?"}
    Resolve["Resolve semantic class identifiers<br/>through GET /api/classes"]
    Browse["Search courses for selected semester"]
    AutoPick["Fetch class groups and auto-pick preferred<br/>TG/CRN group, preferring no clash"]
    Alternate["Optionally preview and choose<br/>an alternative class group"]
    Update["Replace selection for that course"]
    Derive["Server assembles events and detects clashes"]
    Render["Render timetable or exam view"]
    Persist["Persist updated state to localStorage"]
    Action{"Next action"}
    Share["Encode sem + selected classes into /share URL"]
    Export["Export current rendered view or ICS"]
    LocalChange["Hide, recolor, switch week/view,<br/>or change orientation"]
    SelectionChange["Remove course or change semester"]

    Open --> Restore
    Restore -->|Yes| Saved
    Restore -->|No| Default
    Saved --> HasSelections
    Default --> HasSelections
    HasSelections -->|Yes| Resolve
    HasSelections -->|No| Render
    Resolve --> Derive
    Browse --> AutoPick
    AutoPick --> Update
    Alternate --> Update
    Update --> Persist
    Update --> Derive
    Derive --> Render
    Render --> Action
    Action --> Share
    Action --> Export
    Action --> Browse
    Action --> Alternate
    Action --> LocalChange
    Action --> SelectionChange
    LocalChange --> Persist
    LocalChange --> Render
    SelectionChange --> Persist
    SelectionChange --> HasSelections
```

Changing semester loads the saved state for that semester, if one exists. Each
semester keeps its own selected classes, hidden classes, colors, and week
selection, so switching semesters does not leak timetable state between them.

### Semester Planner Flow Diagram

```mermaid
flowchart TD
    Open["Open /planner"]
    Restore{"Valid semester planner<br/>in localStorage?"}
    Default["Use default goal: 130 CU,<br/>8 semesters, empty course bank"]
    Ready["Render course bank, semesters,<br/>and assigned-credit progress"]
    Add{"Add course"}
    Catalog["Search catalog through<br/>GET /api/courses/search"]
    Manual["Enter manual course,<br/>credits, and semester span"]
    Bank["Add unassigned course to bank"]
    Arrange["Drag course to semester,<br/>bank, or trash"]
    BankDrop["Drop on bank to unassign<br/>the course"]
    SemesterDrop["Drop on semester to set<br/>its assigned semester"]
    TrashDrop["Drop on trash to delete<br/>the course from the plan"]
    Normalize["Normalize semester span,<br/>assignment bounds, and plan state"]
    Persist["Persist plan to localStorage"]
    Export["Export versioned JSON backup"]
    Import["Validate JSON backup and<br/>confirm replacement"]
    Print["Build escaped A4 HTML from<br/>normalized plan state"]
    PrintTab["Open Blob URL in new tab;<br/>print or save as PDF"]

    Open --> Restore
    Restore -->|No| Default
    Restore -->|Yes| Ready
    Default --> Ready
    Ready --> Add
    Add --> Catalog
    Add --> Manual
    Catalog --> Bank
    Manual --> Bank
    Bank --> Normalize
    Ready --> Arrange
    Arrange --> BankDrop
    Arrange --> SemesterDrop
    Arrange --> TrashDrop
    BankDrop --> Normalize
    SemesterDrop --> Normalize
    TrashDrop --> Normalize
    Normalize --> Persist
    Persist --> Ready
    Ready --> Export
    Ready --> Import
    Import --> Normalize
    Ready --> Print
    Print --> PrintTab
```

The semester planner also listens for browser `storage` events and the local
`sussplanner:semester-planner-updated` event used by course-page "Add to Planner"
buttons. Those buttons write directly to the same local-storage plan; the next
planner visit hydrates that saved plan.

The UI is split across `components/planner/semester-planner/`:

- `client.tsx` owns state, search, import/export handlers, modals, and semester
  rendering.
- `panel.tsx` renders the Module Bank and trash drop zone.
- `drag-drop.tsx` owns `@dnd-kit/core` drag/drop cards, droppables, overlay
  rendering, drop-target IDs, and drop-target parsing.
- `formatting.ts` contains feature-local display helpers such as CU formatting,
  semester option generation, offered-semester labels, and course sorting.

Course pages use `components/planner/add-to-semester-planner-button.tsx` to add
catalog courses directly into the same browser-local semester planner state.

Planner drag-and-drop is implemented with `@dnd-kit/core`. Dropping a course on
the Module Bank clears its assignment, dropping it on a semester assigns the
course to that semester, and dropping it on the trash deletes it. Invalid or
empty drops are treated as no-ops. Planner search, backup import, and saved-plan
load failures are logged to the browser console, while recoverable cases still
surface a user notice.

The planner header provides these data-protection and presentation actions:

- **Backup Plan** opens a menu containing the JSON **Export** and **Import**
  actions.
- **Export** serializes the current normalized plan into a versioned JSON backup
  and downloads it as
  `sussplanner-semester-plan-YYYY-MM-DD.json`.
- **Import** reads a local JSON file, rejects files larger than 1 MB, parses and
  validates the backup, and shows a module/semester summary before the user
  confirms replacement of the current plan.
- **Download PDF** uses the same normalized `SemesterPlannerState` as JSON export to
  create an escaped A4 HTML document. It opens the document through a temporary
  Blob URL in a new tab, where the user selects **Print / Save as PDF**.
- **Reset Planner** still requires confirmation and replaces the plan with the
  default state.

### Course Registration Reminder Flow Diagram

```mermaid
flowchart TD
    Settings["Open /settings"]
    Preferences["Set reminders enabled,<br/>selected offsets, and banner visibility"]
    SaveSettings["Persist normalized settings<br/>to sussplanner:settings"]
    NotifySettings["Dispatch sussplanner:settings-updated"]
    Planner["Open /planner"]
    Hydrate["Read settings and reminder interaction state"]
    Tick["Refresh reminder clock and storage<br/>on mount, storage events, and 60s interval"]
    Schedule["REGISTRATION_EVENTS<br/>validated bundled schedule"]
    Candidates["Build reminder candidates<br/>for selected offsets and in-app channel"]
    Filter["Filter disabled, wrong channel,<br/>dismissed, or inactive reminders"]
    Urgent["Select most urgent active<br/>reminder per event"]
    Banner{"Any active reminder?"}
    Render["Render RegistrationReminderBanner"]
    Hidden["Render no banner"]
    Action{"User action"}
    Dismiss["Dismiss current reminder ID<br/>for matching eventVersion"]
    Snooze["Snooze current reminder ID<br/>using same local dismissal model"]
    SaveInteraction["Persist to<br/>sussplanner:registration-reminders"]

    Settings --> Preferences --> SaveSettings --> NotifySettings
    Planner --> Hydrate --> Tick
    NotifySettings --> Hydrate
    Tick --> Schedule --> Candidates --> Filter --> Urgent --> Banner
    Banner -->|Yes| Render
    Banner -->|No| Hidden
    Render --> Action
    Action --> Dismiss --> SaveInteraction --> Tick
    Action --> Snooze --> SaveInteraction --> Tick
```

Registration reminders are intentionally in-app only today. The types and
reminder candidate builder can represent a `push` channel, but
`PUSH_REMINDERS_AVAILABLE` is `false` and settings normalization removes
push-only channel selections from user preferences.

The UI integration points are:

- `components/settings/settings-client.tsx` for reminder preference controls.
- `components/planner/semester-planner/client.tsx` for computing active
  reminders and handling dismiss/snooze.
- `components/registration/registration-reminder-banner.tsx` for the rendered
  Planner banner.
- `lib/registration/schedule.ts` for the bundled eCR/add-drop events.
- `lib/registration/reminders.ts` for candidate construction, active/due
  filtering, and most-urgent selection.
- `lib/registration/reminder-storage.ts` for local dismissal persistence and
  stale-record pruning.
- `lib/settings/app-settings.ts` for settings defaults, migration, and
  normalization.

### GPA Calculator Flow Diagram

```mermaid
flowchart TD
    Open["Open direct /calculators route"]
    Restore{"Saved calculator JSON<br/>in localStorage?"}
    Empty["Use empty modules and zero prior record"]
    Ready["Render Current GPA, Cumulative GPA,<br/>module count, and CU summaries"]
    Add{"Add current-semester module"}
    Catalog["Search full catalog through<br/>GET /api/calculator/courses"]
    Custom["Enter custom module label and credits"]
    Grade["Set Credits, Grade, or GPV"]
    Sync["Synchronize Grade and GPV"]
    PF["Toggle Pass/Fail strategy"]
    Prior["Set previous cumulative GPA<br/>and GPA-counted completed CUs"]
    Calculate["Recalculate weighted current<br/>and cumulative GPA"]
    Persist["Persist calculator JSON to localStorage"]
    Clear["Confirm clearing all current modules"]

    Open --> Restore
    Restore -->|No or invalid JSON| Empty
    Restore -->|Yes| Ready
    Empty --> Ready
    Ready --> Add
    Add --> Catalog
    Add --> Custom
    Catalog --> Grade
    Custom --> Grade
    Ready --> Grade
    Grade --> Sync
    Sync --> Calculate
    Ready --> PF
    PF --> Calculate
    Ready --> Prior
    Prior --> Calculate
    Calculate --> Persist
    Persist --> Ready
    Ready --> Clear
    Clear --> Persist
```

Calculator catalog search deliberately does not use class joins, offered
semesters, or current-semester filters. This lets users calculate GPA for any
course present in the `courses` table, including courses that are not currently
presented.

### Admin Flow Diagram

The repository's "admin" flow is a local maintainer workflow, not an in-app
admin panel.

```mermaid
flowchart TD
    Inputs["Collect schedule PDFs<br/>and semester-week JSON"]
    Schema["For a fresh database:<br/>apply schema.sql"]
    Weeks["Generate and review<br/>semester-week SQL"]
    ImportWeeks["Import semester-week SQL"]
    Schedule["Extract and parse schedule PDFs;<br/>generate schedule SQL and course-code list"]
    ReviewSchedule{"Review schedule JSON,<br/>warnings, and SQL"}
    ImportSchedule["Import schedule SQL"]
    Download["Download daytime/evening<br/>course synopsis PDFs"]
    Course["Extract and parse course PDFs,<br/>generate course-detail SQL"]
    ReviewCourse{"Review course JSON,<br/>TSV issues, and SQL"}
    Fix["Correct input or parser output<br/>and regenerate affected artifacts"]
    ImportCourse["Import course-detail SQL"]
    Verify["Run database count and sample queries"]
    Revalidate["Optionally POST /api/cache/revalidate<br/>using CACHE_REVALIDATE_SECRET"]
    Public["Users receive refreshed academic data"]

    Schema --> ImportWeeks
    Inputs --> Weeks
    Inputs --> Schedule
    Weeks --> ImportWeeks
    ImportWeeks --> ReviewSchedule
    Schedule --> ReviewSchedule
    ReviewSchedule -->|Issues found| Fix
    ReviewSchedule -->|Approved| ImportSchedule
    ImportSchedule --> Download
    Download --> Course
    Course --> ReviewCourse
    ReviewCourse -->|Issues found| Fix
    ReviewCourse -->|Approved| ImportCourse
    Fix -->|schedule issue| Schedule
    Fix -->|course issue| Course
    ImportCourse --> Verify
    Verify --> Revalidate
    Revalidate --> Public
```

## Important State Models

### Timetable Persistence State

Storage key: `sussplanner.timetable.v1`

Persisted fields:

- `semesterId`
- `selectedClasses`
- `hiddenClasses`
- `courseColorsByCourseCode`
- `selectedWeekId`
- `orientation`
- `viewMode`
- `semesterStates`, a record of per-semester planner slices with the same
  fields as the active semester state

Related local keys and events:

- `sussplanner:timetable-updated` is the custom event used after timetable
  writes in this browser.
- `sussplanner.timetable.study-mode.v1` stores the global FT/PT study mode as
  `full-time` or `part-time`.
- `sussplanner:timetable-study-mode-updated` is dispatched after study-mode
  changes so mounted timetable controls can refresh without a page reload.
- `sussplanner.timetable-alerts.info-dismissal.v1` stores the signature for the
  currently dismissed informational timetable alert. It is component-local to
  `components/timetable/timetable-alerts.tsx` and is cleared when the relevant
  exceptional-class/event signature changes.

The active semester state is mirrored at the top level for compatibility. Each
semester keeps its own timetable selection, hidden block list, colors, and week
selection. Switching semesters loads the matching slice; reset clears only the
current semester slice.

```mermaid
stateDiagram-v2
    [*] --> Hydrating
    Hydrating --> DefaultState: no valid saved JSON
    Hydrating --> RestoredState: saved JSON passes Zod validation
    DefaultState --> Ready
    RestoredState --> Ready

    Ready --> Resolving: semester or selectedClasses changes with selections
    Resolving --> Ready: timetable API succeeds
    Resolving --> ErrorFallback: timetable API fails
    ErrorFallback --> Ready: next valid change

    Ready --> Ready: empty selection or local-only display change
    Ready --> Persisted: tracked state changes
    Persisted --> Ready: localStorage write completes

    Ready --> ResetPending: user requests reset
    ResetPending --> Ready: cancel
    ResetPending --> Ready: confirm and clear selections, hidden classes, and colors
```

### Shared Timetable State

```mermaid
stateDiagram-v2
    [*] --> CheckParameters
    CheckParameters --> EmptyExplanation: neither sem nor classes is present
    CheckParameters --> DecodeRequested: share parameter present
    DecodeRequested --> InvalidLink: Zod or identifier parsing fails
    DecodeRequested --> Resolving: share state is valid
    Resolving --> ReadOnlyPreview: identifiers resolved
    ReadOnlyPreview --> ReadOnlyPreview: switch week / view / orientation / export
    ReadOnlyPreview --> ImportConfirmation: user selects Import
    ImportConfirmation --> ReadOnlyPreview: cancel
    ImportConfirmation --> Imported: confirm
    Imported --> LocalTimetable: replace saved selections and navigate to /timetable
```

Importing a shared timetable:

- Replaces the saved state for the shared semester only.
- Clears hidden classes.
- Resets selected week to `all`.
- Preserves existing course colors and orientation when available.
- Preserves the existing stored view mode, although the shared preview itself
  initially uses class view.
- Leaves other saved semesters untouched.

Resetting the timetable clears only the selected semester state. It does not
touch other saved semesters.

### App Settings State

Storage key: `sussplanner:settings`

Persisted fields:

- `colorScheme`: `system`, `light`, or `dark`
- `themeId`
- `timetableOrientation`: `horizontal` or `vertical`
- `registrationReminders`

`registrationReminders` contains:

- `enabled`
- `offsetMinutes`
- `channels`
- `inAppBannerEnabled`
- `push`, currently normalized to disabled values because push reminders are
  not available

`lib/settings/app-settings.ts` normalizes legacy boolean reminder settings,
deduplicates supported reminder offsets and channels, removes unavailable push
channels, and dispatches `sussplanner:settings-updated` after saves. The
`SettingsProvider` listens for that event and browser `storage` events to apply
the resolved light/dark colour scheme to the document root.

```mermaid
stateDiagram-v2
    [*] --> Hydrating
    Hydrating --> Defaults: no valid settings JSON
    Hydrating --> NormalizedSettings: saved JSON or legacy boolean settings
    Defaults --> Ready
    NormalizedSettings --> Ready

    Ready --> Ready: change colour scheme, theme, or orientation
    Ready --> Ready: change registration reminder preferences
    Ready --> Persisted: save normalized settings
    Persisted --> Broadcast: dispatch sussplanner:settings-updated
    Broadcast --> Ready
    Ready --> Defaults: confirm reset settings
```

### Course Registration Reminder State

Reminder interaction storage key: `sussplanner:registration-reminders`

Persisted fields:

- `dismissedReminders`, keyed by reminder ID
- Per-dismissal `eventVersion`

Reminder IDs use:

```text
<registration-event-id>:<offsetMinutes>
```

Example:

```text
add-drop-2026-07:10080
```

`eventVersion` is either an explicit schedule version from
`lib/registration/schedule.ts` or a derived string from `startsAt`, `endsAt`,
and `sourceUpdatedAt`. This lets stale dismissals be ignored when the bundled
registration schedule changes.

Default in-app offsets are:

| Offset minutes | Label |
|---:|---|
| `10080` | 7 days before |
| `1440` | 1 day before |
| `0` | At opening time |

Current bundled registration events in `REGISTRATION_EVENTS` are:

| Event ID | Title | Starts | Ends | Schedule version |
|---|---|---|---|---|
| `ecr-2026-03` | eCR Period | `2026-03-17T00:00:00+08:00` | `2026-03-24T23:59:59+08:00` | `ecr-2026-03-v1` |
| `ecr-2026-10` | eCR Period | `2026-10-12T00:00:00+08:00` | `2026-10-23T23:59:59+08:00` | `ecr-2026-10-v1` |
| `add-drop-2026-07` | Add-Drop Period | `2026-07-17T00:00:00+08:00` | `2026-07-28T23:59:59+08:00` | `add-drop-2026-07-v1` |
| `add-drop-2026-12` | Add-Drop Period | `2026-12-18T00:00:00+08:00` | `2026-12-29T23:59:59+08:00` | `add-drop-2026-12-v1` |

The active reminder path uses these rules:

- Build candidates for valid events, selected offsets, and the in-app channel.
- Show a candidate only from `dueAt`/`visibleFrom` through the event `endsAt`.
- Hide candidates whose reminder ID has been dismissed for the same
  `eventVersion`.
- Return only the most urgent active reminder per event by default.
- Sort urgency by latest `dueAt`, then smaller absolute offset, then reminder
  ID.

Dismiss and snooze currently share the same storage behavior: hide the current
reminder ID for the matching event version. A later reminder ID for the same
event can still appear.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> CandidateBuilt: valid event and offset
    CandidateBuilt --> NotYetVisible: now is before dueAt
    CandidateBuilt --> Active: dueAt <= now <= eventEndsAt
    CandidateBuilt --> Expired: now is after eventEndsAt
    Active --> Dismissed: dismiss or snooze
    Dismissed --> Hidden: same reminder ID and eventVersion
    Hidden --> Active: different reminder ID becomes active
    Hidden --> Active: eventVersion changes
    Expired --> Pruned: storage prune removes stale record
```

### Semester Planner State

Storage key: `sussplanner.semester-planner.v1`

Persisted fields:

- `totalCreditsGoal`
- `numSemesters`
- `courses`
- Per-course `id`, `courseCode`, `courseName`, `schoolName`, `creditUnits`,
  `semesterSpan`, `assignedSemester`, and `source`

```mermaid
stateDiagram-v2
    [*] --> Hydrating
    Hydrating --> DefaultPlan: no valid saved plan
    Hydrating --> NormalizedPlan: valid saved plan
    DefaultPlan --> Ready
    NormalizedPlan --> Ready

    Ready --> Ready: add catalog or manual course
    Ready --> Ready: drag course to semester or bank
    Ready --> Ready: edit manual course or remove course
    Ready --> Ready: add/delete empty semester
    Ready --> Ready: change credit goal
    Ready --> Persisted: plan changes
    Persisted --> Ready: localStorage write completes
    Ready --> BackupDownloaded: export versioned JSON
    BackupDownloaded --> Ready
    Ready --> ImportSelected: choose JSON file
    ImportSelected --> ImportRejected: size, parse, or schema validation fails
    ImportRejected --> Ready
    ImportSelected --> ImportPending: valid normalized backup
    ImportPending --> Ready: cancel
    ImportPending --> Persisted: confirm replacement
    Ready --> PrintView: open escaped A4 Blob document
    PrintView --> Ready: print tab is independent
    Ready --> DefaultPlan: confirm reset
```

Semester-planner normalization limits plans to 1-20 semesters and 300 courses.
Catalog courses normally span one semester; `NIE301`, `NIE351`, and course codes
ending in `499` are inferred to span two semesters.

### GPA Calculator State and Formulas

Storage key: `sussplanner:gpa-calculator`

Persisted JSON fields:

- `modules`
- `priorGpa`
- `priorCredits`
- Per-module `courseCode`, `courseName`, `creditUnits`, `grade`, `gradePoint`,
  and `isPassFail`

The calculator is implemented directly in
`components/calculator/gpa-calculator-client.tsx`; it does not currently have a
separate type, validation, or storage module. Hydration catches malformed JSON
and starts clean when parsing fails. Every subsequent module/prior-record
change is written back to `localStorage`.

Grade and GPV are bidirectionally synchronized through the fixed SUSS scale.
Both `A+` and `A` map to `5.0`; selecting GPV `5.0` uses `A` as the canonical
displayed grade.

Pass/Fail modules remain in the current-semester module list and enrolled-CU
total, but are excluded from both GPA point totals and GPA-counted CU
denominators. Their Grade and GPV controls are disabled while Pass/Fail is
selected.

```text
currentGpaCredits = sum(module.creditUnits where !module.isPassFail)

currentGpa =
  sum(module.creditUnits * module.gradePoint where !module.isPassFail)
  / currentGpaCredits

cumulativeGpa =
  (priorGpa * priorCredits
    + sum(module.creditUnits * module.gradePoint where !module.isPassFail))
  / (priorCredits + currentGpaCredits)
```

Current GPA is empty when `currentGpaCredits` is zero. Cumulative GPA is empty
only when `priorCredits + currentGpaCredits` is zero. Users are instructed to
exclude historical Pass/Fail modules from `priorCredits`; the UI cannot verify
that input.

`Clear all` opens the shared `Modal` confirmation and removes only current
modules. It preserves `priorGpa` and `priorCredits`.

### Semester Planner Backup Contract

Semester planners can be exported and restored through this versioned JSON envelope:

```json
{
  "format": "sussplanner-semester-planner",
  "version": 1,
  "exportedAt": "2026-06-12T12:00:00.000Z",
  "plan": {
    "totalCreditsGoal": 130,
    "numSemesters": 8,
    "courses": []
  }
}
```

The backup format and parser live in `lib/planner/storage.ts`; the envelope and
plan schemas live in `lib/validation/planner.ts`. Import protection includes:

- A 1 MB file-size limit before reading the selected file.
- Required `sussplanner-semester-planner` format identifier and supported version
  literal.
- Zod validation of every course and top-level plan field.
- Limits of 1-20 semesters, at most 300 courses, bounded strings/numbers, and
  valid catalog/manual source values.
- Normalization of course codes, semester spans, and assignment bounds after
  parsing.
- Explicit user confirmation before the current plan is replaced.

Invalid or unsupported files show a notice and do not modify the current plan.

### Semester Planner Print/PDF View

`lib/export/semester-planner-print.ts` consumes the same normalized
`SemesterPlannerState` used by JSON export. It creates a browser-only HTML document
with:

- A4 `@page` print sizing and print-specific removal of preview chrome.
- Target credits, assigned credits, module count, and semester count.
- Planned modules grouped by semester, plus unassigned Module Bank courses.
- SUSSPlanner colors and compact summary cards designed to fit on one row.
- HTML escaping for user-entered or imported course codes, names, and school
  names before interpolation into the document.

The generated HTML is opened using a temporary Blob URL with `opener` cleared.
The object URL is revoked after 60 seconds. If the browser blocks the new tab,
the planner shows a notice asking the user to allow pop-ups.

## Key Sequence Diagrams

### Export, Import, or Print a Semester Planner

```mermaid
sequenceDiagram
    actor Student
    participant UI as SemesterPlannerClient
    participant Storage as lib/planner/storage.ts
    participant Validation as lib/validation/planner.ts
    participant Print as lib/export/semester-planner-print.ts
    participant Browser as Browser file / print APIs

    alt Export JSON backup
        Student->>UI: Select Backup Plan, then Export
        UI->>Storage: serializeSemesterPlannerBackup(plan)
        Storage->>Validation: Validate and normalize plan
        Storage-->>UI: Versioned JSON string
        UI->>Browser: Download JSON Blob
    else Import JSON backup
        Student->>UI: Select Backup Plan, then Import and local JSON file
        UI->>UI: Reject file if larger than 1 MB
        UI->>Storage: parseSemesterPlannerBackup(file text)
        Storage->>Validation: Validate envelope and plan
        Validation-->>Storage: Valid parsed backup
        Storage-->>UI: Normalized SemesterPlannerState
        UI-->>Student: Show replacement confirmation and summary
        Student->>UI: Confirm replacement
        UI->>Browser: Persist replacement to localStorage
    else Open PDF print view
        Student->>UI: Select Download PDF
        UI->>Print: openSemesterPlannerPrintView(plan)
        Print->>Storage: normalizeSemesterPlannerState(plan)
        Storage->>Validation: Validate plan
        Validation-->>Storage: Valid parsed plan
        Storage-->>Print: Normalized SemesterPlannerState
        Print->>Print: Escape strings and build A4 HTML
        Print->>Browser: Open temporary HTML Blob URL in new tab
        Student->>Browser: Print / Save as PDF
    end
```

### Select a Course and Resolve a Timetable

```mermaid
sequenceDiagram
    actor Student
    participant UI as PlannerClient
    participant Search as GET /api/courses/search
    participant Classes as GET /api/classes
    participant Queries as lib/db/queries.ts
    participant DB as Postgres
    participant Storage as localStorage

    Student->>UI: Search within selected semester
    UI->>Search: q + semesterIds
    Search->>Queries: searchCourses(filters)
    Queries->>DB: Search courses and class availability
    DB-->>Queries: Matching courses
    Queries-->>Search: CourseSearchResult[]
    Search-->>UI: { courses }

    Student->>UI: Add course / choose class group
    UI->>Classes: courseCode + semesterId
    Classes->>Queries: getCourseClasses(...)
    Queries->>DB: Load classes and events-with-week view
    DB-->>Queries: Class groups and dated events
    Queries-->>Classes: Class groups and dated events
    Classes-->>UI: { classes }
    UI->>UI: Auto-pick preferred group or accept chosen alternative
    UI->>Storage: Persist semantic selection

    UI->>Classes: sem + selected semantic identifiers
    Classes->>Queries: getTimetableDataFromClassIdentifiers(...)
    Queries->>DB: Resolve class IDs, events, weeks, assessments
    DB-->>Queries: Academic rows
    Queries->>Queries: Build selections and detect clashes
    Queries-->>Classes: TimetableData
    Classes-->>UI: { timetable }
    UI-->>Student: Render timetable / exam view
```

### Open and Import a Shared Timetable

```mermaid
sequenceDiagram
    actor Recipient
    participant Page as /share server page
    participant Decoder as share-url + Zod validation
    participant Queries as lib/db/queries.ts
    participant DB as Postgres
    participant Client as ShareClient
    participant Storage as localStorage
    participant Router as Next.js router

    Recipient->>Page: Open /share?sem=...&classes=...
    Page->>Decoder: decodeShareUrlState(...)
    alt Invalid share state
        Decoder-->>Page: Validation error
        Page-->>Recipient: Invalid shared link UI
    else Valid share state
        Decoder-->>Page: semesterId + selectedClasses
        Page->>Queries: getTimetableDataFromClassIdentifiers(...)
        Queries->>DB: Resolve semantic identifiers and load events
        DB-->>Queries: Matching rows
        Queries-->>Page: TimetableData + unresolvedSelections
        Page-->>Client: Render read-only preview
        Client-->>Recipient: Preview without changing local planner
        Recipient->>Client: Confirm import
        Client->>Storage: Replace saved timetable selection state
        Client->>Router: push("/timetable")
    end
```

### Show and Dismiss a Registration Reminder

```mermaid
sequenceDiagram
    actor Student
    participant Settings as SettingsClient
    participant AppSettings as lib/settings/app-settings.ts
    participant Planner as SemesterPlannerClient
    participant Schedule as lib/registration/schedule.ts
    participant Reminders as lib/registration/reminders.ts
    participant ReminderStore as lib/registration/reminder-storage.ts
    participant Banner as RegistrationReminderBanner
    participant Browser as localStorage

    Student->>Settings: Select reminder offsets / banner setting
    Settings->>AppSettings: normalizeRegistrationReminderPreferences(...)
    AppSettings->>Browser: Save sussplanner:settings
    AppSettings-->>Planner: sussplanner:settings-updated event

    Student->>Planner: Open /planner
    Planner->>AppSettings: readAppSettings()
    Planner->>ReminderStore: readLocalRegistrationReminderState(events, now)
    ReminderStore->>Browser: Read sussplanner:registration-reminders
    ReminderStore-->>Planner: Pruned dismissedReminders
    Planner->>Schedule: REGISTRATION_EVENTS
    Planner->>Reminders: getActiveInAppRegistrationReminders(...)
    Reminders-->>Planner: Most urgent active reminders
    Planner-->>Banner: reminders + dismiss/snooze handlers
    Banner-->>Student: Show reminder banner

    alt Student dismisses or snoozes
        Student->>Banner: Dismiss / Snooze
        Banner->>Planner: Handler(reminder)
        Planner->>ReminderStore: dismiss/snoozeLocalRegistrationReminder(...)
        ReminderStore->>Browser: Save dismissed reminder ID and eventVersion
        ReminderStore-->>Planner: Updated interaction state
        Planner->>Reminders: Recompute active reminders
        Reminders-->>Planner: Hidden current reminder, or next active reminder
    end
```

### Maintainer Data Refresh

```mermaid
sequenceDiagram
    actor Maintainer
    participant Source as SUSS/source PDFs + manifests
    participant Scraper as Local scraper commands
    participant Artifacts as JSON / TSV / SQL artifacts
    participant DB as Postgres
    participant Revalidate as POST /api/cache/revalidate
    participant Cache as Next.js tagged data cache
    participant App as Public application

    Maintainer->>Scraper: Run week, schedule, download, and course parse commands
    Scraper->>Source: Read local inputs or request course PDFs
    Source-->>Scraper: Source data
    Scraper->>Artifacts: Write parsed data, issues, and transactional SQL
    Maintainer->>Artifacts: Review warnings and generated output
    Maintainer->>DB: psql import using DATABASE_URL
    DB-->>Maintainer: Import result and verification queries
    Maintainer->>Revalidate: Optionally send secret-authenticated tags/paths request
    Revalidate->>Cache: revalidateTag / revalidatePath
    App->>Cache: Next selected cached lookup
    Cache->>DB: Refresh stale academic data
    DB-->>Cache: Updated academic data
    Cache-->>App: Refreshed lookup result
```

## Data Maintenance and Admin Flow

### Recommended Import Order

For a fresh database, `scraper/README.md` specifies the first six steps below.
Cache revalidation is a separate application operation implemented by its route
handler.

1. Apply `scraper/schema.sql`.
2. Generate and import semester-week SQL.
3. Parse schedule PDFs and import schedule SQL.
4. Download course synopsis PDFs.
5. Parse course synopsis PDFs and import course-detail SQL.
6. Verify database counts/sample rows.
7. Optionally revalidate application caches for a prompt refresh.

Run scraper commands from `scraper/`. The key commands are
`generate:weeks`, `scrape:all`, `download:courses`, and `parse:courses`; import
the generated SQL with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`.
See `scraper/README.md` for exact arguments, review queries, and troubleshooting.

Generated scraper output and downloaded course PDFs are gitignored. Generated
SQL is wrapped in `BEGIN`/`COMMIT` by default.

### Cache Revalidation After Import

```bash
curl -X POST https://<deployment>/api/cache/revalidate \
  -H "x-revalidate-secret: $CACHE_REVALIDATE_SECRET" \
  -H "content-type: application/json" \
  -d '{"tags":["semesters","semester-weeks","classes","courses","assessments"],"paths":["/","/timetable","/planner","/courses"]}'
```

Use an empty JSON object (`{}`), which omits `tags`, to revalidate all known
tags, or provide only the `tags` and optional `paths` that should be
invalidated.

Valid tags are:

- `semesters`
- `semester-weeks`
- `classes`
- `courses`
- `assessments`

## Caching

The application uses two cache layers visible in the repository:

1. **Next.js data cache:** selected lookup functions in `lib/db/queries.ts` use
   `unstable_cache` with a 600-second revalidation interval and cache tags.
2. **HTTP shared-cache headers:** API routes set `Cache-Control` and
   `Vercel-Cache-Tag` headers.

| Route group | Cache-Control |
|---|---|
| Course search | `s-maxage=300, stale-while-revalidate=3600` |
| Classes, class counts, course detail | `s-maxage=3600, stale-while-revalidate=86400` |

The cache-revalidation route can invalidate both known data tags and explicitly
provided paths. If `tags` is omitted, it invalidates all known tags. Malformed
JSON bodies or empty/invalid `tags` arrays return `400`. `GET /api/calculator/courses`
does not currently set shared-cache headers.

## Deployment Notes

- `vercel.json` pins the Vercel region to Singapore: `sin1`.
- The deployed application requires `DATABASE_URL`.
- Configure `CACHE_REVALIDATE_SECRET` if maintainers need on-demand refreshes.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are currently
  optional and unused by runtime code.
- `/timetable`, `/planner`, and `/calculators` are force-dynamic.
- `/settings` uses the shared app shell's server-loaded semester context and
  applies browser-local preferences on the client.
- `/calculators` and `/settings` set `robots.index` and `robots.follow` to
  `false`.
- API route handlers require the Node.js runtime, not the Edge runtime.
- Database connection limits are intentionally small in production (`max: 3`).
- The scraper is designed to run on a maintainer's machine, not inside Vercel.
- Academic tables must already exist before database-backed requests can
  succeed.
- Do not use `drizzle-kit push` against a shared or production database unless a
  schema change is explicitly intended and reviewed.

## Common Development Tasks

| Task | Guidance |
|---|---|
| Run/check the app | Use `npm run dev`, `npm run typecheck`, and `npm run build`. |
| Change a query | Keep DB access in `lib/db/queries.ts`; update returned types and cache tags when dependencies change. |
| Change the schema | Update `scraper/schema.sql`, `lib/db/schema.ts`, and affected SQL generation together. `drizzle/` is not currently the schema source of truth. |
| Change a page | Put server loading in `app/`, interaction in client components, and browser-triggered DB reads behind route handlers. |
| Change share/local state | Update timetable types, Zod validation, URL encoding, local storage, planner, and share-page behavior together. Format changes can invalidate existing URLs/state. |
| Change GPA Calculator behavior | Update `components/calculator/gpa-calculator-client.tsx`; keep Grade/GPV synchronization, Pass/Fail denominators, and local-storage format aligned. |
| Change calculator catalog search | Keep the minimal response and full-catalog behavior in `app/api/calculator/courses/route.ts` and `searchCalculatorCourses` in `lib/db/queries.ts`; do not accidentally add semester/class filters. |
| Change semester-planner backup format | Update `lib/planner/storage.ts`, `lib/validation/planner.ts`, and this guide. Preserve support for existing public versions or reject them with a clear notice. |
| Change semester-planner print output | Update `lib/export/semester-planner-print.ts`; keep all interpolated user/imported strings escaped and verify both A4 preview and print styles. |
| Change app settings | Update `lib/settings/app-settings.ts`, `components/settings/settings-client.tsx`, `components/settings/settings-provider.tsx`, and tests that cover normalization/migration. |
| Change course registration reminders | Update `lib/registration/schedule.ts`, `lib/registration/reminders.ts`, `lib/registration/reminder-storage.ts`, `components/registration/registration-reminder-banner.tsx`, Planner integration, tests, and both guides. Verify timing boundaries around each changed event. |
| Refresh academic data | Follow the maintainer flow above and `scraper/README.md`; review issue reports before import and optionally revalidate caches afterward. |

## Known Limitations

- There is no user account, cloud synchronization, or server-side backup of
  timetable, semester planner, or GPA-calculator state.
- Clearing browser storage or changing browsers loses locally saved plans that
  were not exported as JSON backups.
- GPA-calculator state has no export, import, share, cloud backup, or formal
  Zod validation layer.
- `/calculators` is excluded from search-engine indexing.
- Calculator results depend on user-entered grades, prior GPA, prior
  GPA-counted CUs, and Pass/Fail selections; the app cannot verify them against
  official academic records or policy.
- Only timetable semester/selections are shareable. The multi-semester study
  plan can be imported/exported as JSON but cannot be shared through a URL.
- Semester-planner PDF output depends on the browser print dialog and may require
  users to allow the new print-view tab.
- Share links are limited to 50 class identifiers and depend on those semantic
  identifiers continuing to exist in the selected semester.
- Shared links do not preserve hidden classes, custom colors, selected week,
  orientation, or view mode.
- Prompt academic-data refresh depends on maintainers running the local scraper,
  reviewing/importing generated artifacts, and revalidating caches.
- Course registration reminders depend on the bundled static schedule in
  `lib/registration/schedule.ts`; they are not fetched from an official live
  registration feed.
- Reminder dismiss/snooze state is local-only and does not sync across browsers
  or devices.
- Browser push notifications are represented in the reminder types but are
  disabled by settings normalization and not exposed as a production feature.
- Assessment components represent the latest strategy by course and schedule
  type, not historical semester-specific assessments.
- The root automated test coverage is currently focused on registration
  reminders, reminder storage, settings normalization, and validation; broader
  UI flows still rely on typecheck/build and manual browser verification.
- The scraper relies on external PDF formats and includes warning/issue reports
  because extraction can be incomplete or malformed.
- No in-app admin interface exists.
- The server PDF endpoint produces a timetable event-list PDF, while the
  timetable UI creates a PDF from a browser screenshot. The semester-planner PDF
  action instead opens an A4 HTML print view for the browser to save as PDF.
- `getCurrentSemesterContext` falls back to the first returned semester/week
  when today's date is outside all configured semester-week ranges.

## Assumptions / Gaps

The following details cannot be verified from repository code:

- **Production admin identity/authentication:** the project context describes
  admin authentication for maintainers, but the repository contains no admin
  account model, sign-in route, middleware, or role checks. The only verifiable
  controls are possession of `DATABASE_URL` and `CACHE_REVALIDATE_SECRET`.
- **Credential provisioning and rotation:** there is no documented process for
  granting, rotating, or revoking maintainer database credentials or the cache
  secret.
- **Production database policy configuration:** `scraper/schema.sql` defines
  tables, indexes, triggers, and a security-invoker view, but repository code
  does not define Supabase Row Level Security policies or production network
  restrictions.
- **Automated deployment pipeline:** Vercel region configuration is present, but
  no CI/CD workflow files are tracked.
- **Scheduled scraper execution:** the scraper is documented and implemented as
  a local manual workflow; no cron job or hosted ingestion service exists here.
- **Monitoring, logging, backups, and incident response:** no repository-defined
  production operations process is present.
- **Source-data licensing and update cadence:** source PDF files and parsing
  logic are present, but the intended refresh frequency and distribution rules
  are not defined in code.
