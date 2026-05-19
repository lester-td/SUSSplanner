# Architecture

## Overview

The app is a single Next.js project under `planner/`.

It has two responsibilities:

1. Read academic data from the existing Supabase Postgres schema through Drizzle.
2. Let anonymous users plan and share timetables entirely from client-side state and URL parameters.

There is no server-side timetable persistence in this rewrite.

## Database model

The active data model is the existing Supabase schema:

- `courses`
- `semesters`
- `semester_weeks`
- `classes`
- `class_events`
- `assessment_components`
- `v_class_events_with_week`

The app does not use the older `modules`, `module_offerings`, or admin import model anymore.

## Data access

### Files

- `lib/db/index.ts`
- `lib/db/schema.ts`
- `lib/db/queries.ts`

### Rules

- `DATABASE_URL` is only used server-side.
- Client components do not import the Drizzle client.
- Queries are centralized in `lib/db/queries.ts`.
- The view `v_class_events_with_week` is treated as read-only.

## Timetable domain

### Files

- `lib/timetable/share-url.ts`
- `lib/timetable/local-storage.ts`
- `lib/timetable/clash-detection.ts`
- `lib/timetable/timetable-utils.ts`
- `lib/timetable/date-utils.ts`
- `lib/timetable/types.ts`

### Responsibilities

- decode and encode share URLs
- persist anonymous planner state in localStorage
- resolve semantic class identifiers into database rows
- detect clashes by actual `event_date`, `start_time`, and `end_time`
- transform dated class events into timetable blocks and exam cards for the UI

## Routing

### Pages

- `/planner`: interactive planner with localStorage persistence
- `/courses`: searchable catalog view
- `/courses/[courseCode]`: server-rendered course detail page
- `/share`: read-only shared timetable viewer and importer

### Route handlers

- `/api/courses/search`
- `/api/courses/[courseCode]`
- `/api/classes`
- `/api/export/ics`
- `/api/export/pdf`

## Share flow

Shared links are stateless.

The URL carries:

- `sem`: `semester_id`
- `classes`: comma-separated semantic identifiers in the format `courseCode:scheduleType:groupCodeType:groupCode`

Example:

```text
/share?sem=1&classes=ICT133:evening:TG:T01,ANL252:daytime:CRN:12345
```

On load:

1. the URL is validated with Zod
2. each semantic identifier is matched back to `classes`
3. matching timetable events are loaded from the database
4. unresolved identifiers are surfaced as a warning instead of mutating data

## UI structure

### Shared shell

- `components/layout/app-shell.tsx`

### Planner UI

- `components/timetable/planner-client.tsx`
- `components/timetable/share-client.tsx`
- `components/timetable/timetable-canvas.tsx`
- `components/timetable/selector-rail.tsx`

### Course UI

- `components/courses/course-search-page.tsx`
- `components/courses/course-detail-page.tsx`

The visual direction intentionally keeps the existing color system, spacing, card shapes, button treatment, and timetable layout patterns from the prior frontend scaffold.

## Exports

### ICS

Server-side generation from `class_events`.

### PDF

Server-side generation from resolved timetable data.

### PNG

Client-side capture of the rendered timetable to preserve the visible UI more faithfully.

## Removed from the active architecture

These older code paths are no longer part of the runtime:

- static `index.html` frontend
- legacy browser-side JS modules under `frontend/`
- old module/offering/admin route handlers
- old Drizzle schema based on UUID module records
- sample-data seed/import pipeline for the previous schema
