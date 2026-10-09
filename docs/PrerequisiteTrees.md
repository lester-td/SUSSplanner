# Prerequisite tree data and review workflow

Course pages display the Prerequisite Tree in the right column below the course
facts and immediately above Assessment Components. Its header, border, body
surface and spacing match the neighbouring cards, including the flat sections on
phones. The tree remains visible in a drawing area capped at 320px high, with
scrolling in both directions. **Expand tree** opens a nearly full-screen dialog
containing the same graph and programme disclosures at the same 14px text size.
Its button shares the course page actions' hover glow, focus styling and reduced-motion behaviour.
The left
column retains Description, Topics and Learning Outcomes. A title-area jump link appears when published
requirements or downstream relationships exist. One connected horizontal tree
places postrequisite courses on the left, linked by “needs” to the current course
and its prerequisite branches on the right. Both sides traverse every reachable
published relationship: postrequisites expand downstream, and prerequisite course
leaves expand their own recorded requirements while preserving all/any/N-of
groups and text conditions. Course pages load these branches on the server from
cached course shards; snapshots retain their direct edges and reviewed provenance.
Breadth-first traversal expands each course once along its shortest path in each
direction. The display keeps logical alternatives in independent tree branches.
A repeated course code gets its own node in each branch; its own requirements
expand once across the tree. No connectors merge across separate logical groups.
Unknown courses remain unlinked leaves. No arbitrary course-count or depth limit truncates either course graph;
individual reviewed rules retain their validation budgets.
Both views centre the whole graph when it fits. Larger graphs initially scroll
towards the current course, clamped to the graph's actual bounds without adding
blank padding at its edges. Viewport resizing recalculates the position;
scrolling does not reset the user's position. The expanded graph fills the
available dialog space. Programme disclosures have their own bounded scroll area
and distinct fragment IDs, so requirement links target the active view. The
dialog locks background scrolling, keeps keyboard focus inside and restores
focus to Expand tree when closed. Navigating to another course resets the viewer.
SVG connectors use the same 2px thickness and
meet nodes at their vertical centres, bending between columns. Subtree contours
include both boxes and connector lanes so independent alternatives cannot touch.
Genuinely distinct prerequisite variants branch from a small **by programme**
link that opens the Prerequisite disclosure below. Non-equivalent programme
requirements remain separate even when one is contained in another: ICT233's
`ICT133` and `ICT133 or ANL252` retain separate **by programme** branches.
Only equivalent compacted requirements share a branch across programmes.
Matching nested operators flatten, and duplicate alternatives match regardless
of course order. ALL branches inside an ANY choice remain separate. Curriculum
names stay inside the disclosures rather than taking up space in the tree.
Identical logical structures share a branch even if their remarks differ. A complete set of K-course
combinations displays as the equivalent **at least K of** choice. For example,
ENG308's three pairs become **at least 2 of ENG201, ENG203, ENG311**. Common factors
in alternatives move above the choice: PSY405 becomes **all of PSY107, PSY108,
PSY205, and one of PSY390/PSY391**. Other alternatives retain their operators. This compaction changes only
the display, with the reviewed rules and original wording retained. Boxed course
codes link to their pages, with prefetch disabled. A custom tooltip on hover or
keyboard focus shows just the course code and full name together on one line
when space permits. Clicking or tapping the course box navigates directly.
Tooltips render in a portal, stay within the viewport and remain open while
the pointer is over them. They follow the course during scrolling and close
when it leaves view (including vertical canvas scrolling), on Escape or on
outside interaction. Escape dismisses an open tooltip before closing the dialog.
Unknown codes stay plain without invented names
or links. All boxed courses use the timetable palette. The current course uses
blue, a stronger border and a **Current course** label below its box in both
light and dark mode. Every other visible course column uses a distinct palette
colour; physical columns determine colours even when logical groups put courses
at the same prerequisite distance in different columns. Future trees that exceed
the remaining seven palette colours use tinted variants for further columns.
Course boxes retain 14px text with compact 30px heights, 72px minimum widths and
2px vertical / 6px horizontal padding.
Semester offerings remain on the course pages rather than inside tree nodes.

The feature displays requirements, without assessing student enrolment eligibility.
Initially collapsed disclosures, **Prerequisite** and **Remarks**, sit below
the tree when they have recorded content. Each is hidden independently when empty,
in both the card and expanded view. Each entry has a bold programme label including its study mode and
curriculum version when recorded. Expanded prerequisite courses contribute their
own entries under course-code headings. Identical wording from different plans
keeps each plan's attribution. Recorded text is split at an explicit `Remarks:`
line; reviewed `displayRemarks` take precedence over the raw remarks portion,
while source-only statements retain their literal recorded remarks. Pending
statements carry **Needs verification**. Text-only tree nodes link to the
appropriate disclosure. Remarks can contain the entire requirement and do not
imply that an accompanying tree is complete. The disclaimer spans the available
card width, including “Other requirements may apply.” There is no duplicate
standalone caution below the tree. The header follows the card's rounded corners.
`all`, `any`, `nOf` (at least N), course leaves and text conditions are supported.
An approved rule can also carry `displayRemarks` at its root. These bounded text
remarks appear below the trees, contribute to its approval fingerprint and never
create course edges. They are stored in the
existing approved-rule JSON; private reviewer notes remain private. Nested display
remarks are rejected so canonical group flattening cannot lose their scope.
Concurrent requirements, exclusions, exemptions and replacements remain conditions
or source text unless their prerequisite meaning is explicitly reviewed.

## Source of authority

The Python curriculum extractor supplies suggestions, original source text, parser
contract version 2, page/table/row/section locators, document hashes and warnings.
Fully consumed course expressions support AND/OR groups, parentheses and comma
enumerations interpreted as ALL courses (including Oxford commas). Unparenthesized
alternatives made entirely of AND groups are supported: `ENG201 and ENG203 or
ENG201 and ENG311 or ENG203 and ENG311` becomes any one of three pairs. `ENG101,
ENG103 and (ICT133 or ICT162)` requires both ENG courses plus either ICT course.
Shared courses across distinct alternatives are preserved; repeated identical
choices are rejected. `A and either B or C` requires A and either alternative;
the ACC353 scope is explicitly confirmed during batch triage. Completion verbs,
numbered choices such as TWO (2) of a course list, credit totals with an explicit
"including" clause, and narrowly recognized prior-learning/placement-test
alternatives keep every clause in their trees. Non-course clauses use condition
nodes and never generate course edges. Asymmetric unparenthesized mixed wording,
dated/cohort rules, co-requisites and remaining qualifications keep their complete
text as remarks. No default cohort or implicit course-group membership is inferred.
Published entries retain their recorded prerequisite wording in the Prerequisite
disclosure. The Remarks disclosure shows reviewed notes or literal source remarks;
complete original evidence remains in the snapshots and review artifacts.

Every offering row's remarks cell is checked sentence by sentence, including rows
with an empty prerequisite cell. Completion instructions can create a tree;
mandatory course-group, eligibility and concurrent requirements enter triage.
Recommendations, delivery notes, graduation/credit-recognition conditions,
exclusions and requirements of other courses do not create prerequisite proposals
for this course. Unclear expected preparation remains in triage without completion
edges. Each clause records its disposition and reason in
`prerequisiteRemarksAnalysis`, including clauses omitted from proposals.
Mixed remarks retain actual requirements even when another sentence recommends
optional preparation. Only relevant clauses are parsed or displayed beneath a
tree; complete original cells remain available in source details and audit logs.
Recognized psychology routes retain programme conditions and separate passed
courses from passed-or-concurrent requirements. Concurrent choices are text
conditions and create no prior-completion edges. Remarks that permit a listed
prerequisite concurrently suppress a strict completion tree for that row.
Optional pairing with another course remains course information. Mandatory entry
or placement-test instructions are distinguished from programme scheduling.
Cohort/date restrictions on a listed prerequisite suppress an unrestricted tree;
their complete wording remains in remarks. An explicit `MPCL only` list preserves
its programme condition and each named course.

Contract 2 records `prerequisiteSourceFields` and `prerequisiteRemarksCategories`.
For each proposed requirement, both non-empty source cells form its evidence,
even without "See Remarks". Prerequisite-related clauses can also appear
beneath a supported tree. Standalone pointers are resolved from the same row;
missing remarks are flagged. A changed remarks cell invalidates the review
fingerprint. Contract 1 inputs retain their legacy pointer-only binding for
existing artifacts. Source cells are never overwritten; normalized spacing and
parsing notes appear separately in the review report.
Parser status never establishes approval. Prerequisite diagnostics and warnings
explicitly concerning prerequisites are persisted as sorted, deduplicated
`evidenceDiagnostics` and bound into the review input. Adding, removing or changing
that evidence invalidates a retained decision. Title-only warnings do not affect
it. Unresolved glyph/OCR or interpretation diagnostics prohibit a structured
approval during record validation, including inherited approvals and snapshot
publication. Clean inputs keep their existing fingerprints.

The diagnostic-binding fix for PR #124 refreshed only `expectedInputHash` on 224
of the 746 checked-in decisions (21 approved and 203 source-only); 522 hashes did
not change. Before rebinding, all 746 legacy fingerprints and decision fields
were checked against the saved review extraction at `34661c1`, and the included
PDF bytes/page references were verified. The same extraction supplied the newly
bound diagnostics. Decisions, approved trees, reviewer aliases, timestamps,
notes and publication decisions were preserved, and a second reconciliation was
a no-op. This strengthens the binding of existing reviewed evidence; it does not
record a new academic approval. Git retains the original fingerprints and batch
approval notes as history. Do not repeat this rebinding for changed evidence;
new or changed diagnostics require review.

Two checked-in, format-1 artifacts own stable identities and decisions:

- `scraper/data/reviews/curriculum-plans.json`: programme/source registry, explicit
  scope mappings and fingerprint-bound inclusion/exclusion decisions.
- `scraper/data/reviews/prerequisite-rules.json`: fingerprint-bound rule decisions
  and explicit deactivations. Reviewer aliases and dates are required.

The checked-in artifacts contain the maintainer-approved dataset; see the
[latest verification record](./PrerequisiteTreePreviewChecklist.md#latest-verification-9-october-2026)
for coverage. New or changed evidence requires explicit source/scope mappings and
fingerprint-bound review. Parser results and installation never grant approval.

## Automated preparation and one batch approval

Run from the repository root after extraction, with the maintained schema installed
and a current course-index snapshot available (`npm run data:build`).

```bash
npm run curriculum:batch -- --mode prepare
```

This reads the current database without changing it, verifies all extracted PDF
bytes/pages, and creates `scraper/data/output/curriculum/batch/` with `batch.json`,
`registry-draft.json`, `summary.json`, `review.html` and an empty triage template.
Draft programme identities use extracted names/modes and then retain explicit
registry identities across source changes. Unavailable study modes, curriculum
versions and effective dates remain null. Exact source sections become distinct
applicability labels; they are never silently called programme-wide requirements.
Conflicting occurrences receive separate, explicitly unverified scopes for triage.

The versioned policy proposes structured trees only for fully consumed supported
expressions with clear source sections, valid budgets and no diagnostic/catalogue
issues. Other statements default to source text only. All decisions are proposals;
preparation does not fabricate a reviewer, record approval or import academic data.
The report identifies the original text, candidate interpretation, programme/scope,
PDF page/table/row and flags. Catalogue gaps can be triaged back to a structured
candidate when its source expression is clear; absent metadata remains an unknown
node without an invented course name or link.

Open `review.html`, inspect programme mappings, filter exceptions and change
decisions or corrected trees as needed. **Download triage changes** saves
`triage.json`. Regenerate and inspect the report using that file:

```bash
npm run curriculum:batch -- --mode report --triage PATH/triage.json
```

The summary prints an `approvalId` bound to the immutable batch and normalized
triage choices. Approval verifies the same extraction bytes, original PDF evidence,
catalogue and retained database state. Changed source/catalogue/database inputs
require a new batch; changed triage choices require a new report and approval ID.
Self-references and unresolved source/scope interpretation cannot receive a
structured approval. Correct programme/scope mappings in the draft registry and
prepare again with `--registry PATH/registry-draft.json` when necessary.

After explicit maintainer approval of the exact report, one command records every
ready decision and applies it in the existing guarded transaction. First create
and verify a fresh backup using the [backup procedure](#database-backups):

```bash
npm run db:backup
```

After checking the backup and restore evidence, apply the approved batch:

```bash
npm run curriculum:batch -- --mode approve --triage PATH/triage.json \
  --batch-id 'curriculum-batch-approval:v1:HASH_FROM_SUMMARY' \
  --reviewer REVIEWER_ALIAS --apply
```

The accepted artifacts and SQL are retained under `batch/approved/HASH/`; successful
application also updates the two checked-in review files. Without `--apply`, approve
writes accepted artifacts/SQL only. Pending decisions remain pending; they cannot
silently revoke existing approvals. Same-input corrections replace the current
artifact entry, and changed-input decisions retain explicitly archived history.
No-op reimports preserve existing decision dates and database timestamps. A normal
snapshot rebuild publishes only the accepted database projection.

Preparation and reporting do not change the database. Preparation regenerates
draft files in its output directory; use `--output-dir PATH` to preserve an
earlier report and pass the same directory to subsequent report/approval commands.
Reports validate the retained database state as well as the source evidence.
After an import or another state change, prepare a new batch for further review;
use `npm run curriculum:review -- --mode report --with-db` to reconcile imported
records. `--without-db` supports offline preparation against an explicitly empty
retained state; approval always checks the real database. No batch command runs
in `prebuild`.

`planKey` and `applicabilityKey` are deliberate stable lowercase ASCII slugs.
`default` means confirmed programme-wide applicability. Map the complete PDF SHA-256
to one plan identity, then map each exact extracted section to a declared scope.
Explicit page/table/row overrides take precedence. Paths locate documents; they do
not define identity. Changed bytes or headings require deliberate registry updates.

Rules use `prerequisite:PLAN:COURSE:SCOPE`, with uppercase normalized course codes.
Identical occurrences collapse; conflicting text or candidates in one scope fail.
Unmapped documents/scopes remain internal report items.

| Decision | Public display | Reverse relationships |
| --- | --- | --- |
| Pending (no current decision) | Prerequisite/Remarks text; Needs verification | None |
| Approved | Reviewed tree and source details | Direct course leaves |
| Source only | Recorded text in Prerequisite/Remarks | None |
| Excluded | Absent | None |

Only included plans and active rules publish. Empty requirements mean **No published
prerequisite information**. A missing section never certifies prerequisite absence.
“Helps unlock” means the course appears in an approved rule; other requirements may
apply. A reference outside the catalogue has no invented name, offering or link.
Semester names describe this snapshot's offerings without retirement/current-status
inference. Source URLs must be reviewed absolute HTTPS URLs without credentials;
use null to show the document label/pages as text.

## Reconciliation and explicit imports

Use the scraper Python virtual environment and normal curriculum extraction workflow
from [scraper/README.md](../scraper/README.md). Regenerate older JSON: versioned
candidates must be attached directly to `review.sourceEntries`.

```bash
npm run curriculum:review -- --mode report
npm run curriculum:review -- --mode report --with-db
npm run curriculum:review -- --mode sql --output scraper/data/output/curriculum/reviewed-import.sql
```

`--extraction`, `--registry`, `--reviews` and `--pdf-root` accept alternate input
paths. Report is database-free unless `--with-db` is supplied. It verifies PDF bytes
and page ranges, rejects incomplete/error extraction and emits exact publication
and rule inputs with their expected fingerprints. Populate the registry first,
inspect a report, then bind each decision to its printed `expectedInputHash`.
Approved decisions include the entire reviewer-corrected `approvedRule`; original
parser candidates are retained independently. Source-only/excluded decisions have
no approved tree.

Archive obsolete rule decisions explicitly with `archived: true`. Archived entries
never apply; stale non-archived entries, duplicate key/fingerprint pairs and unknown
keys fail. Change a decision for the same fingerprint in its existing entry; Git
retains prior revisions. This supplies MVP history, without a tamper-proof log.

SQL/apply require the affected retained database state. Generated SQL takes a
transaction advisory lock and table locks, checks the complete expected record set
and every input/decision/activity/update field, then changes records in one
transaction. PostgreSQL timestamp precision is preserved in those guards. Any
failure rolls back. No-op imports preserve approvals and update times. Missing
rules are reported, never implicitly removed. Explicit deactivation retains the
previous evidence and decision; inactive rows remain historical.

Changed document inclusion requires refreshing or deactivating every retained
active rule from the old document in the same transaction. Metadata/input changes
reset affected decisions to pending unless an exact new decision is supplied.

## Schema setup

`scraper/schema.sql` is the maintained schema, mirrored in `lib/db/schema.ts`.
It includes the RLS-enabled `curriculum_plans` and
`curriculum_prerequisite_rules` tables, restrictive plan references, decision
constraints and indexes. Reapplying it adds `evidence_diagnostics` with an empty
array default to existing reviewed tables without rewriting decisions. Install
this additive column before using the updated importer or database snapshot
builder. Reconciliation then binds current diagnostics; stale decisions are reset
to pending unless an exact current review-file decision is supplied.
The applied one-time migration has been removed.
Fresh database setup uses:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scraper/schema.sql
```

For an existing database, back up and inspect it before applying reviewed schema
changes. The maintained schema rejects the old experimental curriculum layout;
retained experimental records require separate reconciliation. The nine-table
Python SQL export and `curriculum-schema-extension.sql` belong to that independent
model and cannot be applied over the reviewed prerequisite tables. See the
[scraper guide](../scraper/README.md#9a-parse-curriculum-plan-pdfs).

## Database backups

`npm run db:backup` creates a private custom-format archive from one exported
repeatable-read snapshot, password-free role definitions, a public schema dump,
archive contents and checksum/count manifest. It uses `DATABASE_BACKUP_URL` when
set, otherwise `DATABASE_URL`; use a direct/session connection, not transaction
port 6543. Inspect and restore-test the application data before schema changes
or academic imports. Keep backup files private and outside Git.
Supabase-managed extensions/roles remain environment dependencies for a full
platform restore. The current restore verification covers the public application
schema and data; it does not claim a complete local Supabase platform restore.

## Snapshot publication

Schema application, academic import and deployment are explicit maintainer
operations. They never run in `prebuild`. After reviewing generated SQL, apply it
with `psql -v ON_ERROR_STOP=1`, or explicitly run:

```bash
npm run curriculum:review -- --mode apply
```

Snapshot format 2 requires both installed tables. Empty tables yield empty published
information; missing/incompatible tables fail with maintained-schema guidance.
Generation reads all eleven relations in one read-only repeatable-read
transaction, closes the database connection, verifies included document evidence,
validates decisions
and generates direct/reverse projections once before writing shards. Keep original
included PDFs available at their registry paths during generation.

Per-course maps contain only the current course, approved leaves, dependents and
their referenced sanitized sources. Private paths, hashes, parser suggestions,
reviewer aliases/notes and SQL identifiers never enter page payloads. Runtime reads
remain database-free, with no metadata requests or automatic course-link prefetch.

Limits are 64 nodes/rule, depth 8, 32 children/operator, 4 KiB UTF-8 per text, and
256 KiB requisites/course. Duplicate canonical ALL/ANY choices and overlapping N-of
course choices fail. There is no silent truncation or semantic simplification.
Self-prerequisites fail; union-graph cycles are reported without universal rejection.
Reports include publication/review-state counts, variants, reverse pairs and distinct
rule contributions, omitted scopes, unknown references, cycles and size maxima.

Validate with Python regression tests, `npm test`, root/scraper typechecks,
`npm run build`, `npm run data:validate`, and the
[preview checklist](./PrerequisiteTreePreviewChecklist.md). For transactional tests,
set `PREREQUISITE_TEST_DATABASE_URL` to an explicitly disposable database; those
tests install the maintained schema and truncate its two curriculum tables.
Without that variable the five integration tests are skipped.

Get sign-off on the coverage report and preview before publishing through the
existing Vercel process. Rollback restores the previous complete code/data
deployment. Local snapshot regeneration still uses the existing offline workflow;
stop local servers during regeneration. Recoverable directory swapping remains a
separate hardening task.
