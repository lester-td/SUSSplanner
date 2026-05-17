# SUSSmods Architecture

## Overview

SUSSmods is split into two runtime layers:

1. A static frontend that runs entirely in the browser
2. A Next.js backend that exposes API routes backed by PostgreSQL

The product goal is intentionally narrow:
- normal users browse module data and build timetables locally
- timetable selections are not persisted on the server
- sharing remains URL-based
- server-side state is only for academic data and admin management

## Stack

### Frontend
- Static HTML, CSS, and browser-side JavaScript
- Main entry files:
  - [index.html](/Users/raventang/Documents/LocalGit/SUSSplanner/index.html)
  - [styles.css](/Users/raventang/Documents/LocalGit/SUSSplanner/styles.css)
  - [script.js](/Users/raventang/Documents/LocalGit/SUSSplanner/script.js)
  - [frontend/js](/Users/raventang/Documents/LocalGit/SUSSplanner/frontend/js)

### Backend
- Next.js Route Handlers
- TypeScript
- PostgreSQL
- Drizzle ORM
- Zod validation
- Supabase Auth for admin-only routes

Core backend files:
- [app/api](/Users/raventang/Documents/LocalGit/SUSSplanner/app/api)
- [lib/db/schema.ts](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/db/schema.ts)
- [lib/db/queries](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/db/queries)
- [lib/auth/admin.ts](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/auth/admin.ts)
- [lib/validation](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/validation)

## High-Level Design

### Frontend Responsibilities
- Fetch module catalog data from the public backend API
- Let users build a timetable locally in memory
- Store local UI state in cookies and share links
- Render timetable layout, conflict lanes, filters, and exports

The frontend does not:
- authenticate normal users
- write timetable selections to the database
- depend on backend planner/session storage

### Backend Responsibilities
- Serve canonical academic data to the frontend
- Validate admin write payloads
- Enforce admin-only access for mutations
- Store and update module, semester, offering, and class data
- Seed the database from the legacy dummy JSON catalog

The backend does not:
- store normal-user planner records
- require login for public reads
- participate in URL timetable sharing logic

## Data Flow

### Public Read Flow

1. The browser loads the static frontend
2. The frontend requests `GET /api/modules` from the Next backend
3. The backend reads normalized Postgres data
4. Query helpers reshape that data into the frontend-compatible module catalog shape
5. The frontend renders the timetable UI from that response

If the backend is unavailable, the frontend falls back to:
- [backend/sampleModules.json](/Users/raventang/Documents/LocalGit/SUSSplanner/backend/sampleModules.json)

### Admin Write Flow

1. An admin sends a request to an `/api/admin/*` route
2. The backend verifies the Supabase session
3. The backend checks that the authenticated Supabase user exists in `admin_profiles`
4. Zod validates the payload
5. Drizzle writes the normalized records into PostgreSQL

## API Design

### Public Routes
- `GET /api/modules`
- `GET /api/modules/[code]`
- `GET /api/classes`
- `GET /api/semesters/active`
- `GET /api/offerings`

These routes:
- do not require login
- allow the static frontend to call them cross-origin during local development
- return data shaped for frontend consumption where appropriate

### Admin Routes
- `POST /api/admin/modules`
- `PATCH /api/admin/modules/[id]`
- `DELETE /api/admin/modules/[id]`
- `POST /api/admin/semesters`
- `PATCH /api/admin/semesters/[id]`
- `POST /api/admin/classes`
- `PATCH /api/admin/classes/[id]`
- `DELETE /api/admin/classes/[id]`
- `POST /api/admin/import`

These routes:
- require a Supabase-authenticated admin
- never expose planner storage because planner storage does not exist server-side

## Database Model

The database is normalized around academic data.

### `modules`
Root module records.

Important fields:
- `id`
- `code`
- `name`

Example:
- `ICT114`

### `semesters`
Academic periods for module offerings.

Important fields:
- `id`
- `academic_year`
- `term`
- `label`
- `is_active`

### `module_offerings`
Join records linking a module to a semester and a TG/group.

Important fields:
- `id`
- `module_id`
- `semester_id`
- `tg`
- `color`

This is the layer that lets the backend preserve the existing frontend expectation that one module root can have multiple TG variants.

### `classes`
Actual scheduled lessons belonging to a module offering.

Important fields:
- `id`
- `offering_id`
- `day`
- `start_time`
- `duration_hours`
- `class_type`
- `venue`
- `week_pattern`

### `admin_profiles`
Whitelist of Supabase users allowed to mutate academic data.

Important fields:
- `id`
- `user_id`
- `email`
- `display_name`

## Frontend-Compatible Response Shape

The old dummy catalog established the browser contract. The backend preserves that contract for `/api/modules`.

Each module entry is shaped like:

```json
{
  "code": "ICT114-TG01",
  "rootCode": "ICT114",
  "tg": "TG01",
  "name": "Computer Architecture",
  "color": "#84cc16",
  "lessons": [
    {
      "day": "Mon",
      "start": "1200",
      "end": "1400",
      "type": "LEC",
      "venue": "C.4.08",
      "weekPattern": "all"
    }
  ]
}
```

This compatibility layer lives mainly in:
- [lib/db/queries/offerings.ts](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/db/queries/offerings.ts)
- [lib/api/catalog.ts](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/api/catalog.ts)

## Validation Rules

Validation is centralized in Zod schemas under:
- [lib/validation](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/validation)

Important SUSS scheduling constraints:
- valid class start times: `08:30`, `12:00`, `15:30`, `19:00`
- valid class durations: `2` or `3` hours
- week patterns: `all`, `odd`, `even`

This keeps invalid timetable data out of the database before Drizzle writes occur.

## Authentication Boundary

Supabase Auth is used only for admin APIs.

### Public Users
- no login required
- no database-backed timetable storage
- state remains in URL parameters and browser storage

### Admin Users
- must have a valid Supabase session
- must also exist in `admin_profiles`

The authorization gate lives in:
- [lib/auth/admin.ts](/Users/raventang/Documents/LocalGit/SUSSplanner/lib/auth/admin.ts)

## Dummy Data And Seeding

The legacy prototype data still exists in:
- [backend/sampleModules.json](/Users/raventang/Documents/LocalGit/SUSSplanner/backend/sampleModules.json)

That file now serves two roles:
- frontend fallback when the backend is unavailable
- source input for seeding PostgreSQL

Seed script:
- [scripts/seed-sample-data.js](/Users/raventang/Documents/LocalGit/SUSSplanner/scripts/seed-sample-data.js)

This script converts the old TG-based JSON structure into normalized `modules`, `module_offerings`, and `classes`.

## Runtime Topology

In local development there are usually two processes:

1. Backend on `http://127.0.0.1:3000`
2. Static frontend on `http://127.0.0.1:5500`

The frontend calls the backend directly across ports. Public API responses include CORS headers so this works during local development.

## Legacy And Transitional Pieces

These files remain in the repo for historical reference or fallback behavior:
- [server.js](/Users/raventang/Documents/LocalGit/SUSSplanner/server.js)
- [backend/csvModuleParser.js](/Users/raventang/Documents/LocalGit/SUSSplanner/backend/csvModuleParser.js)
- [backend/sampleModules.json](/Users/raventang/Documents/LocalGit/SUSSplanner/backend/sampleModules.json)

They are no longer the primary backend architecture. The canonical backend is now the Next.js API layer under [app/api](/Users/raventang/Documents/LocalGit/SUSSplanner/app/api).

## Design Constraints

The architecture intentionally preserves these rules:
- no normal-user accounts
- no planner tables
- no server-side timetable persistence
- no disruption to the existing share-link system
- frontend compatibility with the prototype catalog shape

These constraints keep the system simple: the backend is a content-management layer for academic schedule data, not a multi-user planner platform.
