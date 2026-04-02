# SUSSmods

ECR-planner is a lightweight timetable planner inspired by NUSMods-style layouts.
It runs as a static frontend and can optionally use a Node.js backend for API-driven CSV loading.

## Quick Start

1. Start a local static server:

```bash
python3 -m http.server 5500
```

2. Open the app:

```text
http://127.0.0.1:5500
```

3. Run helper tests (optional):

```bash
node tests.js
```

## What It Does

- Weekly timetable grid for Mon-Sat
- Time range from 08:30 to 22:00
- Horizontal and vertical timetable orientations
- Week pattern filter: `all`, `odd`, `even`
- Week badge and date strip navigation (`<`, `>`, `Current Week`)
- Squish Time mode for compact active-hour views
- Module search and add via dropdown suggestions
- Module legend with:
	- color swatch click to open color palette
	- hide/show toggle
	- remove action
- Conflict lane rendering for overlapping lessons
- Share-link state restore
- Cookie-based local state persistence
- Print/PDF and ICS export

## Data Source

In static mode (`python3 -m http.server 5500`):

- frontend loads fallback data from `backend/sampleModules.json`

In backend mode (`node server.js`):

- `GET /api/modules`

The backend serves data from:

- `backend/sampleModules.json`

## CSV Loading API

This section applies when running the Node backend.

You can load module data from a CSV file at runtime:

- `POST /api/modules/load`

Request body:

```json
{
	"csvPath": "/absolute/path/to/file.csv"
}
```

Example:

```bash
curl -X POST http://127.0.0.1:3000/api/modules/load \
	-H "Content-Type: application/json" \
	-d '{"csvPath":"/absolute/path/to/daytime.csv"}'
```

You can also set a startup CSV file:

```bash
CSV_FILE=/absolute/path/to/daytime.csv node server.js
```

## Project Layout

- `server.js`: static file server and module APIs
- `index.html`: page structure and controls
- `styles.css`: styling and responsive behavior
- `script.js`: app state, orchestration, and rendering lifecycle
- `tests.js`: deterministic helper checks
- `backend/csvModuleParser.js`: CSV to module catalog parser
- `backend/sampleModules.json`: fallback sample module data
- `frontend/js/`: split frontend modules (events, renderers, helpers, state)

## Notes

- State in share links includes selected modules, hidden modules, colors, week filter, week offset/day, orientation, and squish mode.
- Static mode is enough for normal timetable planning.
- Node backend mode is only needed for `/api/modules` and CSV import APIs.
