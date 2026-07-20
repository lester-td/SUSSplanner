# Data Snapshot Operations

## Purpose

Supabase Postgres remains the normalized academic-data source of truth. Public
application requests do not connect to it. A build-time exporter creates split,
read-only JSON snapshots that are bundled into each Vercel deployment.

No database schema change is required.

## A-to-Z Publication Workflow

1. Update the local scraper inputs.
2. Run the relevant scraper parse/generation commands documented in
   `scraper/README.md`.
3. Review parser warnings, issue reports, JSON, TSV, and generated SQL.
4. Import SQL with `psql` using `ON_ERROR_STOP=1`.
5. Run the documented database count and sample-row checks.
6. Locally run `npm run data:build`.
7. Confirm the exporter reports plausible course, class, and event counts.
8. Run `npm test`, `npm run typecheck`, and `npm run build`.
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

The manifest records the snapshot format version, generation time, latest valid
database update time, row coverage, semester/week data, academic-calendar data,
and every shard path.

The generator writes into a temporary sibling directory and only replaces the
active snapshot after every database read, integrity check, and file write
succeeds.

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

`CACHE_REVALIDATE_SECRET` is not used by the snapshot architecture.

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
- a database timestamp cannot be parsed; or
- snapshot files cannot be written atomically.

An existing production deployment remains available if a new build fails.

## Rollback

Use Vercel's deployment rollback/promote controls to restore the preceding
deployment. Because each deployment contains its own complete snapshot, code and
academic data roll back together. Correct the database/import, regenerate
locally, and trigger a new deployment afterward.

## Removing Runtime Database Access

The deployed application does not import the database query client. Keep
`lib/db/schema.ts` and Drizzle tooling because the snapshot generator and schema
maintenance still require them. `DATABASE_URL` must remain configured in Vercel
until snapshot generation moves to an external publication pipeline.
