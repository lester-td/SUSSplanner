# SUSS Planner

SUSS Planner is a student-built academic planning platform for SUSS students.
It includes a Next.js web application and a local scraping/import pipeline for
maintaining academic data.

## What This App Does

- Lets users build a timetable from class groups by semester
- Detects timetable clashes from real dated events
- Supports read-only shared links with optional one-click import into local state
- Exports selected timetable data as PDF, ICS, or PNG
- Stores planner state in browser `localStorage` (no user auth required)
- Supports course search, course details, and multi-semester course planning

## At a Glance

| Area | Main technologies |
|---|---|
| Web application | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Data and validation | Build-time Supabase snapshots, Drizzle ORM, Zod |
| Exports | `pdf-lib`, `html-to-image`, and ICS generation |
| Data ingestion | Local Node.js/TypeScript scraper with Python `pdfplumber` helpers |

The repository contains the web application at the root and a separate
maintainer-operated ingestion pipeline under [`scraper/`](./scraper).

## Prerequisites

- Node.js 20+
- npm 10+
- A Postgres connection string for a database containing the expected academic
  schema and data

The scraper additionally uses Python 3.10+ and `psql`.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Set DATABASE_URL in .env.local
npm run validate:setup
npm run dev
```

Open `http://localhost:3000`.

## Quick Reference

### Common Commands

```bash
npm run dev             # Start the development server
npm run typecheck       # Run TypeScript checks
npm run build           # Create a production build
npm run start           # Run the production build
npm run validate:setup  # Validate first-run setup
npm run data:build      # Regenerate read snapshots from Postgres
```

### Primary Routes

| Route | Purpose |
|---|---|
| `/` | Home page with links to app areas and school portal placeholders |
| `/timetable` | Interactive timetable planner |
| `/courses` | Search and filter the course catalog |
| `/courses/[courseCode]` | View course, assessment, and class details |
| `/planner` | Build a browser-local multi-semester course plan |
| `/calculators` | Estimate GPA and OCAS outcomes |
| `/share?sem=...&classes=...` | Preview and optionally import a shared timetable |

### Environment

Copy `.env.example` to `.env.local`. `DATABASE_URL` is required while generating
the application's read snapshots, including before development and production
builds. It is not used while serving a completed build. The
`NEXT_PUBLIC_SUPABASE_*` variables are currently optional and unused by runtime
application code. Never commit real credentials.

For Vercel deployments backed by Supabase, use the transaction-pooler
connection string (`pooler.supabase.com:6543`) for `DATABASE_URL` so snapshot
generation does not reserve a database session for the duration of a build.

### Important Architecture Notes

- Normal users do not sign in. Timetable and semester planner state is stored in
  browser `localStorage`; clearing browser storage loses that state unless the
  semester planner was exported as a JSON backup.
- Shared timetable links are read-only until the recipient explicitly imports
  them.
- Production requests read generated JSON snapshots and never query Postgres.
- The application build reads academic data but does not update academic tables.
- The academic database schema must exist before snapshots can be generated.
- Do not run `drizzle-kit push` against shared or production databases unless
  an intentional schema change has been reviewed.

For the complete architecture, setup, environment-variable table, repository
structure, API contracts, share/local-state formats, database notes, diagrams,
development workflows, and deployment guidance, see the
[Developer Guide](./docs/DeveloperGuide.md).

## Scraper Workflow

The scraper is a separate maintainer workflow under [`scraper/`](./scraper).
See the [scraper guide](./scraper/README.md) for setup, PDF parsing, SQL
generation, import order, validation, and troubleshooting.

## Documentation

- [User Guide](./docs/UserGuide.md): student-facing instructions for
  timetables, sharing, course search, exports, and semester planning
- [Developer Guide](./docs/DeveloperGuide.md): architecture, setup, routes,
  state models, diagrams, deployment, and development workflows
- [Scraper Guide](./scraper/README.md): academic-data maintenance and import
  workflow
- [Architecture Summary](./ARCHITECTURE.md): focused runtime and data-flow
  reference
- [Data Snapshot Operations](./docs/DataSnapshots.md): publish, deploy,
  validate, and roll back academic-data snapshots

## License

MIT (see [`LICENSE`](./LICENSE)).
