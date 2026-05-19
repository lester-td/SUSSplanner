# SUSS Planner

SUSS Planner is a full-stack Next.js timetable planner rebuilt around the existing Supabase Postgres schema.

## Key constraints

- The database schema is the source of truth.
- Existing Supabase tables and data are preserved.
- No destructive migrations are included for the core academic tables.
- Share links are stateless and human-readable.
- Planner state is stored in localStorage for anonymous users.

## Stack

- Next.js App Router
- TypeScript
- Drizzle ORM
- Supabase Postgres via `DATABASE_URL`
- Tailwind CSS v4
- Zod
- Route Handlers for search, class lookup, and exports

## Routes

### Pages

- `/planner`
- `/courses`
- `/courses/[courseCode]`
- `/share?sem=...&classes=...`
- `/` reuses `/planner`

### APIs

- `GET /api/courses/search`
- `GET /api/courses/[courseCode]`
- `GET /api/classes`
- `GET /api/export/ics`
- `GET /api/export/pdf`

PNG export is implemented client-side so the captured image stays visually close to the rendered timetable.

## Environment variables

Create `.env.local` from `.env.example`.

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Notes:

- `DATABASE_URL` is server-only.
- The current rewrite does not require Supabase Auth for normal planner usage.
- `NEXT_PUBLIC_SUPABASE_*` are retained for future Supabase browser integrations, but the current planner logic does not depend on them.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

## Verify

```bash
npm run typecheck
npm run build
```

## Drizzle

The Drizzle schema in `lib/db/schema.ts` mirrors the existing Supabase schema manually. No migrations are included for the live academic tables.

Generate a migration only if you intentionally change the schema later:

```bash
npm run db:generate
```

If you want to introspect the current database manually instead of editing the schema by hand:

```bash
npx drizzle-kit introspect --config drizzle.config.ts
```

Do not run `drizzle-kit push` against the existing Supabase database unless you explicitly intend to change it.

## Share link format

Shared timetables use semantic class identifiers instead of raw `class_id` values.

Example:

```text
/share?sem=1&classes=ICT133:evening:TG:T01,ANL252:daytime:CRN:12345
```

## Local planner state

The planner persists the following in localStorage:

- selected semester
- selected class identifiers
- hidden classes
- current week filter
- timetable orientation
- timetable/exam view mode

Shared links never overwrite local planner state unless the user clicks `Import timetable` and confirms.
