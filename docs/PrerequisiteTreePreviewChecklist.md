# Prerequisite tree preview checks

## Natural canvas bounds without empty edge padding: 9 October 2026

Removed the padding previously used to force edge courses into the viewport's
centre. Both views now centre the whole graph when it fits. Larger graphs scroll
towards the current course within their actual bounds, leaving no additional
scrollable space before or after the graph. Course sizes and relationships remain
unchanged.

Chromium checked ICT133, ICT341, PSY405, SWK102, OGP381 and HBC213 at 1440, 768 and
390px in the card and expanded view. Canvas dimensions matched the graph or
available viewport, fitting trees centred without overflow, and larger trees
stopped at their natural edges with the current course visible. Every node and
connector, 14px course text, the 320px card height cap, focus restoration and
contained page overflow passed. Landscape resizing also passed. Typecheck and
356 application tests passed; five opt-in database tests remain skipped. No
browser script errors occurred. Evidence: `/tmp/suss-tree-bounds-results.json`,
`/tmp/suss-tree-bounds-ICT133.png`.

## Shared button hover and conditional spoilers: 9 October 2026

**Expand tree** now shares the course page quick actions' hover transition and
glow, keyboard focus ring and reduced-motion behaviour. **Prerequisite** and
**Remarks** each appear only when recorded content exists, in both the card and
expanded viewer. Empty spoilers and their placeholder text are omitted. The tree
remains above Assessment Components in the right column.

Chromium checked ICT341, PSY405, SWK102, EAS423, FIN322, HBC213, ECE499, ANL305 and
ANL503 at 1440 and 390px. Prerequisite-only, remarks-only, both and neither cases
passed, including populated content, fragment targets, current-course centring,
retained graph nodes/connectors, focus restoration and contained overflow. Computed
hover styles and focus rings matched the quick actions in light and dark modes;
reduced-motion transitions were disabled. All 450 published trees retained valid
source fragment targets. Typecheck and 356 application tests passed; five opt-in
database tests remain skipped. No browser script errors occurred. Evidence:
`/tmp/suss-tree-actions-results.json`, `/tmp/suss-tree-source-targets.json`,
`/tmp/suss-tree-actions-hover.png`.

## Bounded canvas and expanded viewer: 9 October 2026

The right-column graph now has a 320px height cap and native scrolling in both
directions. Short graphs keep their compact height. Both the card and the nearly
full-screen **Expand tree** dialog initially centre the current course, including
edge courses through extra canvas padding. Viewport resizing recentres it; manual
scrolling keeps the chosen position. The expanded viewer retains the same nodes,
connectors, colours and 14px course text, with programme disclosures in a separate
bounded scroll area and distinct fragment targets.

The dialog locks background scrolling, traps keyboard focus and restores focus
on close. Escape first dismisses any course tooltip, then the dialog. Vertical
canvas scrolling closes tooltips when their anchors leave view. Course navigation
resets the viewer and releases the scroll lock.

Chromium checked twelve courses at 1440, 768 and 390px: ICT341, PSY405, SWK102,
COU102, SWK291, EAS423, OGP381, ACC208, FIN322, ANL305, HBC213 and the empty AAI301
case. The tall 1412px graphs remained bounded; wide and short graphs retained
their text size. Both views centred the current course and the expanded view
retained every node and connector. Keyboard focus cycling/restoration, tooltip
dismissal, programme links opening only the active disclosure, backdrop dismissal,
light/dark mode, landscape resizing, direct touch navigation and scroll-lock
cleanup passed without browser script errors. Typecheck and all 355 application
tests passed; five opt-in database tests remain skipped. Evidence:
`/tmp/suss-tree-expand-results.json`, `/tmp/suss-tree-expand-core-results.json`,
`/tmp/suss-tree-expanded-light.png`, `/tmp/suss-tree-expanded-dark.png`,
`/tmp/suss-tree-bounded-tall.png`.

## Tree above assessments in the right column: 9 October 2026

Moved the visible tree below course facts and above Assessment Components in the
right column. Its header shares the neighbouring cards' 40px minimum height,
8px / 12px padding, typography and blue background. Borders, body surfaces and
12px body padding also match the course cards; mobile follows the same flat
section treatment. The left column again contains Description, Topics and
Learning Outcomes. Wide graphs retain horizontal scrolling and 14px course text.

Chromium checked ICT341, PSY405, SWK486, ECE499, ANL305 and AAI301 at 1440, 1280,
768 and 390px in light and dark modes. Computed header and card styles matched
Assessment Components and Available Classes in every viewport. Section order,
contained scrolling, no page overflow, the title jump link, course tooltips and
programme disclosures passed; AAI301 still omits the empty tree. Typecheck passed
and no browser script errors occurred. Evidence:
`/tmp/suss-tree-right-results.json`, `/tmp/suss-tree-right-light.png`,
`/tmp/suss-tree-right-dark.png`.

## Tree in the left column: 9 October 2026

Moved the visible tree directly after Description and before Topics in the left
column. The right column's facts, assessments and available classes retain the
same desktop positions and dimensions. Wide trees scroll within their card;
graphs that fit remain centred. Parent section spacing replaces the tree's
previous standalone top margin.

Chromium compared the right column before and after at 1440 and 1280px for
ICT341, PSY405, SWK486, ECE499, ANL305 and AAI301: every right-column card retained
its position and dimensions. Checks at 768 and 390px confirmed contained tree
scrolling and no page overflow. Section order, the visible tree, the title jump
link and course tooltips passed; AAI301 still omits the empty tree. Typecheck
passed and no browser script errors occurred. Evidence:
`/tmp/suss-tree-placement-before.json`, `/tmp/suss-tree-placement-after.json`,
`/tmp/suss-tree-placement-ICT341.png`.

## Smaller boxes with restored text size: 9 October 2026

Restored the original 14px course-code text. Course boxes now use 30px heights,
72px minimum widths and 2px vertical / 6px horizontal padding, reducing empty
space rather than shrinking the text. Chromium checked ICT341, PSY405 and SWK486
at 1440, 768 and 390px: every boxed code retained 14px text without clipping,
the current-course label stayed outside, and there was no page overflow or
browser script error. Typecheck, all 353 application tests and the geometry
audit across 450 trees passed; five opt-in database tests remain skipped.
Evidence: `/tmp/suss-tree-box-sizing-results.json`,
`/tmp/suss-tree-box-sizing.png`, `/tmp/suss-all-tree-geometry-results.json`.

## Overlapping alternatives, column colours and compact boxes: 9 October 2026

Redundant programme branches collapse when their combined routes already match
one recorded variant. ICT233 now displays **one of ANL252 / ICT133** without a
second ICT133 branch. The same correction applies to ENG311, FIN384, MTH355,
BME313, BME315, BME352, BME358 and BME359, including occurrences inside other
courses' expanded trees. Genuine differences in FIN322, FIN323 and EAS401 retain
their programme branches. Both programme spoilers retain all source attribution.

The current course is blue (`#C3DCEA`) with its label below the box. Other visible
course columns use distinct timetable palette colours, regardless of prerequisite
distance or intervening logical groups. Course boxes have reduced padding,
36px heights and 84px minimum widths. The hover is now a tooltip containing only
the course code and name; boxes navigate directly on click or first touchscreen
tap. The hover action and dialog-specific keyboard interaction are removed.

Chromium checked twenty courses at 1440, 768 and 390px, including all nine
simplified courses, ICT341's nested ICT233 branch, genuine programme differences
and trees with seven course columns. Column colours, external current-course
labels, compact dimensions, disclosures, contained overflow, inline tooltip text,
hover persistence, keyboard focus/Escape, direct click/touch navigation and
light/dark mode passed without browser script errors. Typecheck and all 353
application tests passed; five opt-in database tests remain skipped. Truth-table
regressions verify route equivalence for single courses, OR lists, ALL branches
and common factors. A fresh geometry audit of all 450 published trees retained
every reachable course, with no overlapping nodes, connectors crossing nodes or
intersections between unrelated connectors. Evidence:
`/tmp/suss-tree-column-results.json`, `/tmp/suss-tree-column-*.png`,
`/tmp/suss-all-tree-geometry-results.json`.

## Level colours and programme disclosures: 9 October 2026

All boxed courses now use the timetable palette, with the same colour for the
same prerequisite/postrequisite distance from the current course. Logical groups
do not add a level. The orange current-course badge and border remain distinct.
Hover cards put the course code and name together, followed by a compact **View
Course Page** link. Narrow screens wrap the name naturally within the viewport.

The full-width disclaimer includes “Other requirements may apply.” Its duplicate
standalone line is removed, and the header background follows the rounded card
corners. **Prerequisite** and **Remarks** replace the original-wording disclosure;
both start closed and show bold programme/curriculum labels with their text.
Identical text across plans keeps each attribution. Nested prerequisite courses
retain course headings. **by programme** replaces **varies** and opens the
Prerequisite disclosure; text-only nodes open the appropriate disclosure.

Chromium checked ten representative courses at 1440, 768 and 390px, including
ICT233's multiple programmes, ECE499's prerequisite/remark split, ANL305's repeated
source wording and OGP381's nested remarks. Inline hover text, keyboard navigation,
touch navigation, pointer movement into the card, light/dark mode, palette levels,
closed disclosure defaults, native fragment opening and contained overflow passed
with no browser script errors. Typecheck and all 348 application tests passed;
five opt-in database tests remain skipped. A fresh geometry audit of all 450
published trees retained every reachable course, with no overlapping nodes,
connectors crossing nodes or intersections between unrelated connectors.
Evidence: `/tmp/suss-tree-level-results.json`, `/tmp/suss-tree-level-*.png`,
`/tmp/suss-all-tree-geometry-results.json`.

## Course hover cards and current-course highlight: 9 October 2026

Removed the boxed-course instruction. Course nodes now show a custom card with
the code, full course name and **View Course Page** link on hover, keyboard focus
or a first touchscreen tap. Native course title tooltips are removed. The current
course uses orange (`#F2CCA0`) from the timetable palette, a 2px border and a
**Current course** label. The graph's geometry is unchanged.

Chromium checked 1440, 768 and 390px widths, light/dark mode, pointer movement into
the card, keyboard focus, ArrowDown to its link, Escape dismissal/focus restoration,
touch previews and explicit course navigation. Cards stay within the viewport and
follow their anchors during scrolling, including native scrolling after touch or
keyboard focus. Unknown courses remain plain. Hover and focus initiate no course
prefetch requests. No browser script errors occurred. Typecheck and all 344
application tests passed; five opt-in database tests remain skipped. Evidence:
`/tmp/suss-course-hover-results.json`, `/tmp/suss-course-hover-*.png`,
`/tmp/suss-course-current-dark.png`.

## Separate logical branches: 9 October 2026

The shared-node layout below was replaced after PSY405 exposed visually merged
ALL groups. The display now uses independent logical branches and repeated course
nodes where necessary. Common factors move above an alternative without changing
the reviewed rule: PSY405 requires PSY107, PSY108 and PSY205, plus one of PSY390
or PSY391. PSY391's two prerequisite pairs occupy separate branches. Course
requirements expand once, preserving all reachable courses without return markers.
Subtree packing includes connector lanes in its contours, preventing unrelated
branches from touching. The complete PSY405 tree fits in 777 × 388px.

Chromium checked PSY405, PSY391 and the fifteen courses from the preceding pass
at 1440, 768 and 390px. All reachable prerequisites/postrequisites, hover titles,
course links, centred placement, contained scrolling, 2px strokes, conditions and
nested remarks passed. Geometry checks explicitly reject intersections between
unrelated connectors, as well as node overlaps and lines crossing nodes. PSY405
dark mode and navigation to PSY391 passed; AAI301 still omits the empty section.
No browser script errors occurred. Typecheck and all 344 application tests passed;
five opt-in database tests remain skipped. New regressions verify all 32 completion
combinations for PSY405 and disjoint connectors for alternatives that repeat
course codes. A complete audit of all 450 published course trees also passed:
every reachable course and every layout node was retained, with no overlapping
nodes, connectors crossing nodes or intersections between unrelated connectors.
Evidence: `/tmp/suss-branch-tree-results.json`, `/tmp/suss-branch-tree-*.png`,
`/tmp/suss-all-tree-geometry-results.json`.

The records below describe earlier layouts and their verification.

## Shared course graph (superseded): 9 October 2026

The display now uses one node per course, with shared connections and compact
logical operators. Repeated course boxes, return markers and numbered requirement
nodes are removed. Complete course combinations display as an equivalent counted
choice; ENG308 shows **at least 2 of ENG201, ENG203, ENG311**. Its reviewed source
wording remains available below, and the full prerequisite graph fits in 910 ×
148px. Distinct programme requirements use **varies**; all remarks remain visible
below the graph.

Chromium checked ENG308, ICT239, ICT341, ICT133, ICT162, MTH109, ACC201, ACC353,
BME352, ECE499, MTD365, OGP381, ANL305, RSS501 and CET315 at 1440, 768 and 390px;
AAI301 still omits the empty section. Every reachable prerequisite and
postrequisite appeared exactly once. Geometry checks found no overlapping nodes,
connectors crossing unrelated nodes, clipped conditions or page overflow. Graphs
centre when they fit and scroll within the panel otherwise. All SVG connectors
use 2px strokes and bend between columns; unrelated branches have distinct lanes.
Full-name hover titles, catalogue links, explicit navigation, nested remarks and
dark mode passed without browser script errors. Typecheck and all 342 application
tests passed; five opt-in database tests remain skipped. Regressions verify logical
equivalence, incomplete alternatives, shared course connections, distinct variants,
retained remarks, cycle layout and connector routes. Evidence:
`/tmp/suss-shared-graph-results.json`, `/tmp/suss-shared-graph-*.png`.

The records below describe earlier layouts and their verification.

## Compact tree redesign: 9 October 2026

Verified against the local development server with Chromium at 1440, 768 and
390px using ACC353, ACC305, BME352, MTD365, ECE499, ANL305, RSS501 and CET315; AAI301
still omits the empty section. The connected tree places postrequisite courses
on the left, joins them through “needs” to the current course, and branches into
prerequisites on the right. The horizontal layout preserves nested operators,
deduplicates identical text requirements and omits curriculum-plan and semester
lists. Boxed course links navigate correctly and carry full-name hover titles.
Remarks appear below the trees. Wide trees scroll within the panel without page
overflow; light/dark screenshots and browser checks found no application errors.
Typecheck, all 326 unit tests and the final 87 prerequisite regressions passed; five
opt-in database tests remain skipped. Evidence is in
`/tmp/suss-tree-redesign-preview.json` and `/tmp/suss-tree-redesign-*.png`.

The connected layout was rechecked with ICT239, COU204, ACC353, BME352, MTD365,
ANL305 and RSS501 at the same widths. ICT239 matches the requested chain:
ICT341 — needs — ICT239 — all of — ICT133 / ICT162. Branch positioning, remarks,
mobile containment and dark mode passed, along with typecheck and 87 prerequisite
tests. Updated screenshots are `/tmp/suss-tree-connected-ICT239.png` and
`/tmp/suss-tree-connected-dark.png`.

The postrequisite side now expands all reachable downstream courses from cached
course shards, without a fixed count/depth cutoff. Verified at 1440, 768 and 390px:
ICT133 shows 18 reachable courses (13 direct), ICT162 shows 5 (4 direct), MTH109
shows 23 (5 direct), ACC201 shows 19 (10 direct), and OGP181 includes the complete
OGP381 — needs — OGP281 — needs — OGP181 chain. ICT239, MTD365 and an empty page
also passed. Every reachable catalogued course appeared, unknown codes stayed
plain, downstream links navigated correctly, and no page overflow or application
errors occurred. Typecheck and all 331 unit tests passed; five opt-in database
tests remain skipped. Synthetic regressions cover 48-course chains, shared paths,
cycles and missing/unknown snapshots. Evidence: `/tmp/suss-tree-expanded-results.json`
and `/tmp/suss-tree-expanded-*.png`.

Prerequisite course leaves now expand recursively as well, preserving all/any/N-of
groups, conditions, distinct variants and nested course remarks. Rechecked ICT239,
ICT341, ACC353, BME352, ECE499, MTD365, OGP381, ICT133, MTH109 and an empty page at
1440, 768 and 390px. Every reachable catalogued prerequisite appeared; ICT341 shows
five prerequisite courses, and OGP381 includes OGP281 and OGP181 with their remarks
labelled below the tree. Browser geometry checks verified centring whenever the
tree fits, accessible overflow otherwise, uniform 2px horizontal/vertical lines
and matching branch/child centre points. Light/dark screenshots and browser checks
found no application errors. Typecheck and all 337 unit tests passed, with five
opt-in database tests skipped. Regressions cover 48-course prerequisite chains,
all/any/N-of preservation, shared courses, cycles, unknown/missing metadata and
nested text-only remarks. Evidence: `/tmp/suss-tree-recursive-results.json` and
`/tmp/suss-tree-recursive-*.png`.

The checklist and production verification below record the earlier card layout.
Its programme/source lists, semester disclosures and current-course link behavior
have been superseded by the compact redesign described above.

Run against a production build and record the tested revision, dataset, browser,
widths and date. Keep synthetic fixtures labelled and confined to an isolated
preview workspace. The completed checks below cover the implementation preview
and the approved dataset recorded here.

- [x] Section follows Learning Outcomes and Available Classes, above the footer.
- [x] Jump link appears for direct, text-only and reverse-only information and moves
  keyboard focus to the section. Empty pages omit the section and jump link.
- [x] Programme variants retain mode/version and applicability labels. Source
  details reveal complete original wording and page references.
- [x] ALL, ANY, at-least-N, conditions, pending and source-only wording are explicit.
- [x] Unknown references appear without links or invented names. The current course
  has no self-link; known references use their supplied course links.
- [x] Keyboard links and disclosures have visible focus. Enter/Space toggles native
  details, and expanded content remains readable.
- [x] Pointer and touch users can open semester/source details without hover.
- [x] Mobile, tablet and desktop widths have no horizontal overflow. Deep rules,
  long names/conditions and multiple variants wrap within the container.
- [x] Light/dark themes retain contrast; reduced-motion disables tree transitions.
- [x] Entering the viewport, hovering/focusing nodes and opening disclosures initiate
  no course/API prefetch requests. Explicit navigation and class fetches work.
- [x] Course route tracing contains course shards and excludes the complete index.
- [x] `npm run data:validate` and `npm run validate:start` reject incompatible or
  malformed artifacts and accept valid format-2 artifacts.
- [x] The reviewed coverage report reconciles decisions, omitted scopes, unknown
  codes, cycles and maximum sizes before publication.

## Latest verification: 9 October 2026

The maintainer-approved batch was imported after a fresh database backup. The
public application schema/data restored successfully in disposable PostgreSQL 18:
all eleven table counts, the update function and eight triggers matched.
Managed platform schemas were not locally restore-tested. The private archive
and checksum manifest remain in
`scraper/data/db-backup/prerequisite-bulk-import-2026-10-09/`.

| Approved dataset | Verified result |
| --- | --- |
| Included plans / active statements | 135 / 746 |
| Structured / source-only / pending / excluded statements | 543 / 203 / 0 / 0 |
| Canonical structured variants / direct reverse pairs | 263 / 629 |
| Unknown prerequisite codes / target codes | 46 / 46; 86 distinct, all retained |
| Union-graph cycles | 0 |
| Course payloads matching the approved-source projection | 1413 |
| Pages with trees / remarks only / reverse relationships only | 220 / 96 / 134 |
| Pages without published prerequisite information | 963 |
| Largest prerequisite payload / emitted course shard | 35,527 / 525,656 bytes |

Reconciliation found zero changed records against the accepted reviews and original
evidence. Existing application table counts were unchanged. Private review metadata
is excluded from public payloads. All 135 included source PDFs are tracked for
reproducible builds.

Chromium 149 verified 18 production course pages at 1508, 768 and 390px widths.
Checks covered programme scopes, full source disclosures, qualifications, literal
remarks, unknown nodes, section placement and keyboard jump focus. OGP381 links to
OGP281, whose tree leads to OGP181. No horizontal overflow, browser script errors,
failed application responses or automatic course/API prefetch were found. Two
Vercel analytics scripts unavailable on localhost are recorded separately.

All 326 application tests and 30 Python regression tests passed, along with
TypeScript checks, production build, snapshot validation and startup validation.
The five opt-in PostgreSQL integration tests also passed after cleanup against a
fresh disposable database initialized from the maintained `scraper/schema.sql`.
Temporary test services were stopped. **The website has not been deployed.**

Current evidence is retained under `scraper/data/output/curriculum/batch/`:

- `post-import-verification.json` and `post-import-reconciliation.log`
- `post-import-snapshot-verification.json`
- `post-import-browser-verification.json`
- `post-import-build.log` and `import-completion.json`

The accepted review JSONs, approval record and guarded SQL are under
`approved/1bd355d51f0b34151871270f6a210cef6663b1be297e115619e941034e7f692d/`.
Superseded exports and intermediate reports were removed; the latest extraction,
current review report, accepted decisions, source PDFs and database backups remain.

Follow [Prerequisite Trees](./PrerequisiteTrees.md) for another review/import and
[Data Snapshot Operations](./DataSnapshots.md) for deployment and rollback.
