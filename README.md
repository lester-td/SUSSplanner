# ECR-planner

Frontend prototype of a NUSMods-style semester timetable planner.

## Run

Start the backend server:

`node server.js`

Then open:

`http://127.0.0.1:3000`

Run deterministic helper tests:

`node tests.js`

## Current Features

- NUSMods-inspired weekly timetable grid (Mon-Sun)
- Time axis from 8:30am to 10:00pm
- Week mode filtering: All / Lecture (Odd) / Tutorial (Even)
- Week indicator badge showing week number and odd/even parity
- Date-strip navigation with previous/next week and Today shortcut
- Orientation toggle (horizontal/vertical calendar)
- Squish Time mode to focus on active class hours
- Module search with inline dropdown suggestions
- Added Modules section
- Hide/Show per module
- Remove per module
- 20-color preset palette per module
- Conflict visualization with side-by-side lane layout
- Empty-state and status messaging
- Share link support for restoring the same NUSMods-style timetable state
- Print/PDF export and ICS export
- Cookie-based state persistence
- Accessibility support (focusable events, ARIA labels, conflict text badge)

## Share Link Behavior

The share link captures and restores the current timetable state, including:

- selected modules
- hidden modules
- module colors
- week mode
- week offset/day selection
- orientation and squish settings

If clipboard copy is blocked, a copy dialog opens instead of printing a long URL in the status area.
Use the `Hide` button in the status panel to dismiss messages.

## Backend CSV Loading

Module data is now served by the backend.

- Frontend loads module data from `GET /api/modules`
- Backend can load CSV by calling `POST /api/modules/load`

Example load request:

`curl -X POST http://127.0.0.1:3000/api/modules/load -H "Content-Type: application/json" -d '{"csvPath":"/absolute/path/to/daytime.csv"}'`

You can also set startup CSV path:

`CSV_FILE=/absolute/path/to/daytime.csv node server.js`

## Project Structure

- `index.html`: app layout and controls
- `styles.css`: visual styling and responsive layout
- `script.js`: timetable logic, state handling, rendering, and events
- `tests.js`: deterministic helper tests

## Customize

Edit the `moduleCatalog` array in `script.js` to add your own modules/lessons and tailor the NUSMods-style planner to your timetable.
