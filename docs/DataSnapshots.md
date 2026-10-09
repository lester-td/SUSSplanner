# Data Snapshot Operations

## Purpose

Supabase Postgres remains the normalized academic-data source of truth. Public
application requests do not connect to it. A build-time exporter creates split,
read-only JSON snapshots that are bundled into each Vercel deployment.

The database must match `scraper/schema.sql` before building snapshots, including
the two reviewed curriculum tables required by format-2 snapshots. Fresh database
setup uses the maintained schema; back up and inspect existing databases before
applying schema changes. Installed empty tables are valid partial coverage. For
prerequisite review, approval and import guards, see
[Prerequisite Trees](./PrerequisiteTrees.md).

Set `semesters.has_intake_schedule` explicitly for validated intake schedules;
new semesters default to unavailable. Calendar weeks and continuation sessions
do not establish intake availability.

## Publication Workflow

1. Update the local scraper inputs.
2. Run the relevant scraper parse/generation commands documented in
   the [scraper guide](../scraper/README.md).
3. Review parser warnings, issue reports, JSON, TSV, and generated SQL.
4. Create and verify a fresh database backup with `npm run db:backup` from the
   repository root before importing.
5. Import regular academic SQL with `psql` using `ON_ERROR_STOP=1`. For curriculum
   prerequisites, use the [reviewed batch workflow](./PrerequisiteTrees.md#automated-preparation-and-one-batch-approval).
6. Check database counts and sample rows; reconcile prerequisite decisions with
   `npm run curriculum:review -- --mode report --with-db` when applicable.
7. Run `npm test`, `npm run typecheck`, and `npm run build`. The build regenerates
   snapshots; confirm plausible coverage and prerequisite report counts.
8. Run `npm run data:validate` against the generated snapshots. For a data-only
   inspection before building, use `npm run data:build`.
9. Test `/`, `/timetable`, `/courses`, a course detail page, a shared link, and
   ICS/PDF export against the production-like build.
10. Push the application change when code changed, or trigger the production
    Vercel Deploy Hook when only database data changed.
11. Vercel reruns `npm run build`; `prebuild` regenerates snapshots from the
    current database before compiling Next.js.
12. A failed snapshot generation or application build prevents publication.
13. After Vercel promotes the deployment, verify the displayed global update
    timestamp and representative course/class records.

## Commands

```bash
npm run data:build
npm test
npm run typecheck
npm run build
```

`npm run dev` and `npm run build` automatically run `data:build` first.

Generated files live under `data/snapshots/` and are intentionally gitignored.
Do not edit or commit them manually.

## Snapshot Layout

```text
data/snapshots/
├── manifest.json
├── course-index.json
├── courses/
│   └── <bucket-id>.json
└── schedules/
    └── <semester-id>-<bucket-id>.json
```

Course codes are assigned to one of 16 deterministic hash buckets. This keeps
individual reads small while avoiding thousands of files in Vercel function
bundles.

Format-2 course shards include programme-scoped prerequisite variants, remarks,
sanitized sources, node metadata and direct reverse relationships. Builds require
the original included curriculum PDFs at their registry paths to verify approved
evidence; runtime requests use only the resulting shards.

The manifest records the snapshot format version, generation time, latest valid
database update time, row coverage, semester/week data, academic-calendar data,
and every shard path.

The generator writes into a temporary sibling directory and only replaces the
active snapshot after every database read, integrity check, and file write
succeeds. Local replacement removes the previous directory before renaming the
new one. Stop local servers during regeneration; if replacement fails, regenerate
before starting them again.

## Vercel Configuration

### Environment variables

Configure `DATABASE_URL` for Production with the Supabase transaction-pooler
connection string on port `6543`. It is consumed during the Build Step.

Configure Preview separately if previews should build from a database. Prefer a
non-production dataset for untrusted preview branches.

Feedback email variables remain independent:

```text
RESEND_API_KEY
FEEDBACK_EMAIL_FROM
FEEDBACK_EMAIL_TO
```

### Deploy Hook

In Vercel, open **Project → Settings → Git → Deploy Hooks**. Create a hook named
`Publish database snapshot` for the production branch. Store the generated URL
in the maintainer machine or CI secret store as `VERCEL_DEPLOY_HOOK_URL`.

After a verified data-only import:

```bash
curl -X POST "$VERCEL_DEPLOY_HOOK_URL"
```

Treat the hook URL as a secret because possession allows deployment triggers.

## Runtime Behavior

- Pages and APIs use `lib/data/*`, not `lib/db/*`.
- Snapshot reads are memoized inside warm Node.js function instances.
- API responses are cached at Vercel's shared edge for the deployment.
- A cache miss reads deployment files, never Postgres.
- User timetable and planner state remains in browser `localStorage`.

## Validation and Failure Modes

Snapshot generation fails when:

- `DATABASE_URL` is missing or invalid;
- required course or semester tables are empty;
- a class references a missing course or semester;
- a class event references a missing class;
- reviewed curriculum tables are missing or incompatible;
- included source PDFs are missing or their hashes/page ranges do not match;
- prerequisite decisions are stale, rules are malformed or payload limits are
  exceeded;
- a database timestamp cannot be parsed; or
- snapshot files cannot be written or the snapshot directory cannot be replaced.

An existing production deployment remains available if a new build fails.

## Rollback

Use Vercel's deployment rollback/promote controls to restore the preceding
deployment. Because each deployment contains its own complete snapshot, code and
academic data roll back together. Correct the database/import, regenerate
locally, and trigger a new deployment afterward.

## Build-Time Database Dependency

Keep `lib/db/schema.ts`, Drizzle tooling, and Vercel's `DATABASE_URL` configuration
for snapshot generation and schema maintenance. Runtime requests use snapshots.
