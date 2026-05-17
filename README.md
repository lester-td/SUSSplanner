# SUSSmods

SUSSmods is a timetable planner with:
- a static frontend in this repo
- a Next.js backend using PostgreSQL, Drizzle ORM, Zod, and Supabase Auth for admin-only routes

Normal users do not log in. Their timetable selections stay in the URL and browser storage. The backend only stores module, semester, offering, and class data.

## Project Modes

### Frontend
- Served as a static site from this repo
- Loads timetable data from the backend public API
- Falls back to `backend/sampleModules.json` only if the backend is unavailable

### Backend
- Next.js Route Handlers under `app/api`
- Public read APIs for modules, classes, offerings, and the active semester
- Admin-only write APIs protected by Supabase Auth plus `admin_profiles`

## Start The Backend

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env.local
```

3. Fill in `.env.local`:

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_PUBLIC_ORIGIN=http://127.0.0.1:5500
```

4. Generate and apply the database schema:

```bash
npm run db:generate
npm run db:migrate
```

5. Carry the current dummy data into PostgreSQL:

```bash
npm run db:seed:sample
```

Optional seed variables:

```bash
SEED_ACADEMIC_YEAR=2026/2027 SEED_TERM=1 npm run db:seed:sample
```

6. Start the backend:

```bash
npm run dev
```

Backend URL:

```text
http://127.0.0.1:3000
```

## Start The Frontend

Start a static server from the repo root:

```bash
python3 -m http.server 5500
```

Open:

```text
http://127.0.0.1:5500
```

By default, the frontend calls the backend at:

```text
http://127.0.0.1:3000/api/modules
```

So in normal local development:

1. Start the backend on port `3000`
2. Start the frontend on port `5500`
3. Open the frontend URL

## Admin Setup

Admin routes require both:
- a valid Supabase Auth session
- a matching row in `admin_profiles.user_id`

You must create at least one Supabase user and insert that user UUID into `admin_profiles` before the admin APIs will work.

## Public API Routes

- `GET /api/modules`
- `GET /api/modules/[code]`
- `GET /api/classes`
- `GET /api/semesters/active`
- `GET /api/offerings`

## Admin API Routes

- `POST /api/admin/modules`
- `PATCH /api/admin/modules/[id]`
- `DELETE /api/admin/modules/[id]`
- `POST /api/admin/semesters`
- `PATCH /api/admin/semesters/[id]`
- `POST /api/admin/classes`
- `PATCH /api/admin/classes/[id]`
- `DELETE /api/admin/classes/[id]`
- `POST /api/admin/import`

## Legacy Files

These older files are still present for reference and frontend fallback behavior:
- `backend/sampleModules.json`
- `backend/csvModuleParser.js`
- `server.js`

The new backend path is the Next.js app under `app/api`, not `server.js`.

## Helper Tests

You can still run the existing helper tests with:

```bash
node tests.js
```
