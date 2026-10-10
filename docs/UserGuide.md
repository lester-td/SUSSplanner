# SUSSPlanner User Guide

## Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
- [Planning Courses](#planning-courses)
  - [Search for Courses](#search-for-courses)
  - [View Course Information](#view-course-information)
  - [Add Courses to Your Semester Planner](#add-courses-to-your-semester-planner)
  - [Organise Your Semester Planner](#organise-your-semester-planner)
  - [Share Your Semester Planner](#share-your-semester-planner)
  - [Back Up or Restore Your Semester Planner](#back-up-or-restore-your-semester-planner)
- [Calculating GPA](#calculating-gpa)
  - [Add Current-Semester Modules](#add-current-semester-modules)
  - [Enter Grades and Credit Units](#enter-grades-and-credit-units)
  - [Calculate Cumulative GPA](#calculate-cumulative-gpa)
  - [Compare a Pass/Fail Strategy](#compare-a-passfail-strategy)
- [Building a Timetable](#building-a-timetable)
  - [Create a Timetable](#create-a-timetable)
  - [Change a Class Group](#change-a-class-group)
  - [Resolve a Timetable Clash](#resolve-a-timetable-clash)
  - [Timetable Downloads](#timetable-downloads)
- [Sharing Timetables](#sharing-timetables)
- [Managing Settings and Course Registration Reminders](#managing-settings-and-course-registration-reminders)
  - [Change Timetable Appearance](#change-timetable-appearance)
  - [Use Course Registration Reminders](#use-course-registration-reminders)
  - [Dismiss a Reminder](#dismiss-a-reminder)
- [Common Workflows](#common-workflows)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Support](#support)

## Introduction

SUSSPlanner is a student-built planning tool for SUSS students. It helps you
explore courses, plan your degree, build a semester timetable, check for
clashes, calculate GPA, and share a timetable with friends.

You do not need an account or sign-in.

### What You Can Do

| Feature | What It Helps You Do |
|---|---|
| **Courses** | Search for courses and review course, assessment, and class information. |
| **Planner** | Arrange courses across semesters, back up or restore the plan, download a PDF, and see upcoming registration reminders. |
| **GPA Calculator** | Calculate current and cumulative GPA and compare a Pass/Fail strategy. |
| **Timetable** | Build a semester timetable and check for schedule clashes. |
| **Share** | Send a timetable preview or semester-plan snapshot to a friend. |
| **Download** | Save your timetable as a PNG, PDF, or calendar file. |
| **Settings** | Change appearance, timetable defaults, and registration reminders. |

### Before You Start

SUSSPlanner saves your timetable, semester planner, GPA Calculator entries,
settings, and reminder dismissals in your current browser.

- Your plans do not automatically appear on another device or browser.
- Clearing your browser data may permanently remove your plans.
- Private or incognito browsing may not keep your plans after you close the
  window.
- There is no account-based or online backup. Export a Planner JSON backup if
  you may need to restore the plan later or move it to another browser.

## Getting Started

### Open SUSSPlanner

1. Open the SUSSPlanner link provided by your school community or the project
   maintainers.
2. Use the navigation at the top of the page:
   - **Home** for a start page with app links and school portal shortcuts.
   - **Timetable** for your semester schedule.
   - **Courses** for course search and details.
   - **Planner** for your multi-semester course plan.
   - **Calculators** for GPA estimates.
   - **Settings** for appearance and course registration reminder preferences.
   - **Feedback** to report bugs, incorrect data, or feature requests.

### Browser and Device

Use a current version of Chrome, Edge, Firefox, or Safari. You will need an
internet connection to load course and timetable information.

The **Planner** supports drag and drop on desktop and tap-to-assign controls on
mobile.

Make sure your browser allows:

- Saving website data, so your plans remain available.
- Downloads, if you want PNG, PDF, or calendar files.
- Clipboard access, if you want **Share** to copy links automatically.

If automatic copying is blocked, SUSSPlanner displays the link for you to copy
manually.

## Planning Courses

### Search for Courses

There are four places where you can search:

| Where | Best Used For |
|---|---|
| **Courses** | Exploring the full course catalog and viewing details. |
| **Planner** | Adding courses to your long-term semester planner. |
| **GPA Calculator** | Adding any catalog module to a current/cumulative GPA estimate. |
| **Timetable** | Adding courses offered in the selected semester. |

#### Search the Full Course Catalog

1. Open **Courses**.
2. Browse the full catalog or search by course code, title, or description.
3. Use **Search Settings** to narrow the results.
4. Use the pagination controls to move through results, 10 courses at a time.
5. Select a course title to view more information.

The search filters include:

- **Offered In**
- **Schedule**: Daytime or Evening
- **Course Level**
- **Course Type**: Undergraduate Courses, Postgraduate Courses, and Available as GSP/UNE
- **Assessments**: TMA, GBA, Quiz, ECA, Written Exam, Proctored Online Exam, and Online Exam
- **School**

Select **Reset all** to clear the filters.

#### Search in the Planner

1. Open **Planner**.
2. Set **Add a Course** to Search mode.
3. Choose **Any Semester** or a specific semester.
4. Search by course code or title.
5. Select a result.

The course appears in the **Module Bank**.

#### Search in the Timetable

1. Open **Timetable**.
2. Choose the correct semester.
3. Search under **My Courses**.
4. Select a result.

If the course is not offered or has no available class groups for that
semester, SUSSPlanner displays a message instead of adding it.

### View Course Information

1. Open **Courses**.
2. Find and select a course.
3. Review the available information, which may include:
   - Credit units and course level.
   - School and academic track.
   - Course synopsis.
   - Topics and learning outcomes.
   - Assessment components.
   - Offered semesters.
   - Available classes.
4. Under **Available Classes**, choose a **Semester**.
5. Select a class group to open its **Class Schedule**.
6. If daytime and evening assessments differ, choose the schedule you want to
   view.

Some courses may not have information for every section.

When prerequisite information has been published, **View prerequisites ↓** near
the course title jumps to a visible **Prerequisite Tree** above Assessment
Components. On desktop it sits in the right column below the course facts;
Description, Topics and Learning Outcomes remain in the left column.
The tree is connected from left to right: postrequisite courses **need** the
current course, which connects to its prerequisite branches. **all of** requires
every item, **one of** requires one alternative, and **at least N of** requires
the stated number of choices. Both sides expand recursively: the “needs” side
continues through downstream courses, and prerequisite courses show their own
requirements, including nested logical groups. Alternatives have separate branches;
course codes may repeat where they belong to different requirements. Each course's
own requirements expand once. Common requirements can appear above a choice, and complete combinations may display
as an equivalent counted choice; for example, any pair of three courses becomes
**at least 2 of** those courses. Trees that fit are centred within
a drawing area capped at 320px high. Larger trees start near the current course
without adding empty space beyond their edges. Scroll horizontally or vertically to explore
it. Select **Expand tree** for a nearly full-screen view with the same course
text size and programme details. Close the expanded view to return to the card.
Boxed course codes link to their course pages. Hover or focus a compact box to
see a tooltip with just the course code and full name together. Click or tap
the box to open its course page. All boxed courses use timetable colours, with
a distinct colour for each visible column. The current course is blue with a
stronger border and **Current course** label below its box. Press Escape to
dismiss a tooltip.
Courses absent from the catalogue appear as plain codes without links.
Overlapping alternatives display once; for example, ICT233 shows **one of ICT133
/ ANL252**. **by programme** remains for genuinely different recorded requirements;
select it to open the recorded wording below the tree. Expand **Prerequisite**
or **Remarks** to read programme-labelled entries; sections without recorded
content are hidden. Remarks may contain mandatory
conditions. Entries for expanded prerequisite courses are labelled by course code.
Statements awaiting review display **Needs verification**.
Each “needs” connection follows a reviewed prerequisite relationship; other
requirements may apply. Prerequisite trees are experimental; always check your
programme's curriculum plan for updated information.
Missing information does not mean a course has no prerequisites.

### Add Courses to Your Semester Planner

#### Add a Listed Course

1. Find the course on **Courses**.
2. Select **Add to Planner**.
3. Open **Planner**.

The button changes to **In Planner**, and the course appears in the **Module
Bank**.

#### Add a Custom Course or Placeholder

Use a custom course for a course that is not listed, a work attachment, or a
future requirement.

1. Open **Planner**.
2. On desktop, switch **Module Bank** to Custom mode. On mobile, tap
   **Add Course** at the bottom, then switch to Custom mode.
3. Enter a course code or name.
4. Enter the credit units.
5. Enter the semester span.
6. Select **Add Custom Module**.

The custom course appears in the **Module Bank**. On mobile, choose a semester
to assign it immediately, or select **Keep in Module Bank**.

### Remove Courses

#### Remove a Course from the Timetable

1. Open **Timetable**.
2. Find the course under **My Courses**.
3. Select **Remove course**.

The course and its classes are removed from the timetable.

#### Remove a Course from the Planner

1. Open **Planner**.
2. Drag the course to the red trash area.
3. Release it when the area says **Release to delete course**.

On mobile, tap the course’s **⋯** menu, select **Remove course**, then confirm.
The same menu is available beside unassigned courses in the Module Bank.

This cannot be undone.

### Organise Your Semester Planner

A new plan starts with 130 target credit units and 8 semesters. Adjust **Target
Credits** and **Semesters** to match your degree; plans support 1–20 semesters.

1. Add courses to the **Module Bank**.
2. Drag each course into the semester when you plan to take it.
3. Drag a course to another semester to move it.
4. Drag a course back to the **Module Bank** to leave it unassigned.
5. Select **Add Semester** if you need more semesters.
6. Delete a semester only when it is empty.
7. Review **Credits Allocated** and each semester’s credit-unit total.
8. Use the edit button on a custom course to change its name, credit units, or
   semester span.

Select **Show All** to see every added course in the Module Bank. Select **Show
Available** to show only courses that have not been assigned.

Courses that span more than one semester are shown as continuing in later
semesters.

#### Planning on Mobile

- Tap **Plan settings** under Progress to expand the credit target, semester
  count, PDF, backup, and reset controls.
- Tap a semester header to expand or collapse its course list.
- Tap **Add Course** at the bottom to search the catalog or enter a custom course.
  After adding it, choose a semester or keep it in the Module Bank.
- Tap **Module Bank** at the bottom to see unassigned courses. Select **Assign**
  beside a course, then choose its destination semester. The page opens and
  scrolls to that semester.
- Use a course’s **⋯** menu to move it, return it to the bank, edit a custom course,
  or remove it. Continuing courses use the same menu. The panel shows the course’s
  current semester or semester range.
- Destinations that cannot accommodate the full semester span are disabled.
- Swiping over courses scrolls the page. Drag-and-drop remains available on
  desktop. While a bottom panel is open, the page behind it stays still.

### Share Your Semester Planner

1. Select **Share** in Progress.
2. Select **Copy link**, or **Share** on a supported phone to choose an app.
3. Send the link to the recipient.

The link contains a snapshot of your courses, credit target, semesters and Module
Bank. Later edits do not change a link you have already shared.

Opening a link shows **Save shared plan?**, with a credit summary and collapsible
semester groups. Expand each semester or the Module Bank to inspect its courses.
The summary and save controls stay visible while the preview scrolls.
Select **Save shared plan** to replace the current planner on that device, or
**Cancel** to keep the existing plan. Once saved, it can be edited or reset normally.

### Back Up or Restore Your Semester Planner

To download a restorable backup:

1. Open **Planner**.
2. Select **Backup**.
3. Select **Export**.

To restore a backup:

1. Open **Planner**.
2. Select **Backup**.
3. Select **Import**, then choose a SUSSPlanner semester-plan JSON backup.
4. Review the module and semester counts.
5. Select **Replace Current Plan** to confirm.

Importing replaces the current plan. Invalid, unsupported, or oversized backup
files are rejected without changing it.

### Download Your Semester Planner as a PDF

1. Open **Planner**.
2. Select **Download PDF**.
3. In the new print-view tab, select **Print / Save as PDF**.

Allow the new tab if your browser blocks it.

### Reset Your Semester Planner

1. Open **Planner**.
2. Select **Reset** under Progress.
3. Read the warning.
4. Select **Reset Planner** again to confirm.

This clears all courses, semester assignments, and Planner settings. It cannot
be undone.

## Calculating GPA

### Open the Calculators Page

1. Open SUSSPlanner.
2. Select **Calculators** in the navigation.

### Add Current-Semester Modules

#### Search the Course Catalog

1. Keep **Add a Module** in Search mode.
2. Search by module code or title.
3. Select a result to add it.

Calculator search checks the full course catalog. A module can be selected even
when it is not presented in the current semester.

#### Add a Custom Module

Use Custom mode for an unlisted module, work attachment, or placeholder.

1. Switch **Add a Module** to Custom mode.
2. Enter a module code or name.
3. Enter its credit units.
4. Select **Add Module**.

Duplicate module codes cannot be added.

### Enter Grades and Credit Units

Each current-semester module has:

- **Credits**, which determine its GPA weight.
- **Grade**, using the SUSS grade scale.
- **GPV**, the Grade Point Value.
- **Pass/Fail**, which excludes the module from GPA calculations when selected.

Changing the Grade automatically updates the GPV. Changing the GPV
automatically updates the Grade. Because both **A+** and **A** have a GPV of
5.0, selecting GPV 5.0 displays **A**.

| Grade | GPV |
|---|---:|
| A+, A | 5.0 |
| A- | 4.5 |
| B+ | 4.0 |
| B | 3.5 |
| B- | 3.0 |
| C+ | 2.5 |
| C | 2.0 |
| D+ | 1.5 |
| D | 1.0 |
| F | 0.0 |

**Current GPA** is the credit-weighted GPA of current modules that are not
marked Pass/Fail. The summary shows how many current-semester CUs are counted
out of the total enrolled CUs.

### Calculate Cumulative GPA

Under **Prior academic record**, enter:

1. Your cumulative GPA before the current semester.
2. Your previously completed CUs that count towards GPA.

Do **not** include credit units from Pass/Fail modules in **Previously Completed
CUs**. Select the information button in the top-right of the card to see this
reminder.

**Cumulative GPA** combines the prior academic record with current-semester
modules that are not marked Pass/Fail.

### Compare a Pass/Fail Strategy

1. Enter the expected grades for all current-semester modules.
2. Select **Pass/Fail** beside a module you are considering.
3. Compare the updated **Current GPA** and **Cumulative GPA**.
4. Select or clear other Pass/Fail checkboxes to compare strategies.

A module marked Pass/Fail remains listed and still counts towards the displayed
total enrolled CUs, but its credits and grade points are excluded from both GPA
calculations. Its Grade and GPV controls are disabled until Pass/Fail is
cleared.

### Remove or Clear Calculator Modules

- Select the trash button beside a module to remove only that module.
- Select **Clear all**, then **Clear All Modules**, to remove every
  current-semester module.

Clearing modules does not change the prior cumulative GPA or previously
completed CUs. The clear-all confirmation cannot be undone.

## Building a Timetable

### Create a Timetable

1. Open **Timetable**.
2. Choose your semester.
3. In **Settings**, set **Default class type** to **Full-time** or **Part-time**
   if you want to change the preferred class groups.
4. Search for a course under **My Courses**.
5. Select the course to add it.
6. Continue adding courses.
7. Review **Total Credit Units**.
8. Check for **Detected timetable clashes**.

Your timetable is saved automatically in the current browser. When you add a
course, SUSSPlanner picks an available class group and tries to avoid clashes.

For example, when a listed course spans multiple semesters, selecting its starting class also
adds a continuation in the next offered semester. Its block shows **Continues
Jul '26** at the bottom. In July, the carried-over block is labelled **NIE301
(Jan '26)** and its class can only be switched in the starting semester. You can remove it
from either semester; removing a carried-over entry removes its linked starting
selection and continuation, while preserving a separate July start.

You can also add a separate July start of NIE301. Course search and class
switching show classes from the selected semester, and the July start stays
separate from the January continuation. Continuations retain the exact schedule
type and TG/CRN chosen in the starting semester, and show only sessions belonging
to that original cohort. A reused July TG/CRN does not supply sessions for the
January continuation. If no continuation sessions are published, its entry stays
saved without adding sessions from another cohort.

Continuation labels can name a later semester before its calendar weeks are
available in the timetable selector.

### Change a Class Group

If another class group is available:

1. Select one of the course's blocks on the timetable.
2. Review the alternative blocks shown.
3. Select your preferred alternative.

The selected class group replaces the previous one.

### Resolve a Timetable Clash

When classes overlap, SUSSPlanner displays **Detected timetable clashes** above
the timetable.

1. Read the warning to find the affected courses, date, and time.
2. Select a timetable block for one of the affected courses.
3. Choose another class group if alternatives are available.
4. Check whether the clash warning disappears.
5. Try another affected course or remove a course if needed.

SUSSPlanner can identify clashes, but a clash-free combination may not always
be available.

### View Course and Timetable Details

- Select a semester at the top of the timetable to change semesters.
- Select **All Weeks** for an overview.
- Select an individual week to focus on that week.
- Select **Show All Weeks** to return to the overview.
- Select **Exam Cal** to view exams.
- Select **Timetable** to return to classes.
- Select **Vertical** or **Horizontal** to change the page layout.
- Select **View class schedule** beside a course to review its sessions and
  exam details.
- Use **Order by Code**, **Order by Exam**, or **Order by CU** to organise
  **My Courses**.

A course with a scheduled exam shows its date and time. If the selected class group has
an exam assessment but no dated exam event, the course instead shows **Proctored
Online Exam**, **Online Exam**, or **Has an Exam**, followed by **Check
Canvas/Learnova for exam details.** These courses appear in **Exams without
timetable dates** below the dated exam calendar; no date is inferred from another
class group. Courses without an exam assessment may show **No Exam** or **ECA**.

On narrow screens, the vertical **All weeks** view allows sideways scrolling
when classes overlap in time. The time column stays pinned, and overlapping
classes keep a readable width. Other vertical views fit the screen width.

### Hide, Show, or Recolour a Course

#### Hide or Show

1. Find the course under **My Courses**.
2. Select **Hide course** to remove it from the timetable display.
3. Select **Show course** to display it again.

Hiding a course does not remove it and does not resolve its clashes.

#### Change the Colour

1. Select the colour square beside the course.
2. Choose a new colour.

### Reset Your Timetable

1. Select **Reset**.
2. Read the warning.
3. Select **Reset** again to confirm.

This clears courses starting in this semester, hidden-course settings, and custom
colours. Carried-over courses remain after reset and can be removed individually. Your
current semester, selected week, layout, and timetable or exam view remain.

### Timetable Downloads

1. Open **Timetable**.
2. Choose the view you want to save.
3. Select **Download**.
4. Choose a format.

| Format | What You Receive |
|---|---|
| **PNG** | An image of the selected timetable or exam view. |
| **PDF** | Opens the browser print dialog. Save as PDF to get the timetable and exam calendar on white landscape A4 pages, followed by a selectable-text class-session list on portrait A4 pages. |
| **ICS** | A calendar file that can be opened or imported into a calendar app. |

## Sharing Timetables

### What a Shared Link Includes

A shared link includes:

- The selected semester.
- The selected class groups.

It does not include:

- Hidden-course settings.
- Custom colours.
- Selected week.
- Vertical or horizontal layout.
- Timetable or exam view.

For multi-semester plans, use [Share in the Planner](#share-your-semester-planner).

### Send a Timetable to a Friend

1. Open **Timetable**.
2. Confirm that the correct semester and class groups are selected.
3. Select **Share**.
4. Send the copied link to your friend.

Anyone with the full link can view the timetable.

### Preview a Shared Timetable

When you open a shared link, you can:

- Review its classes and clashes.
- Change the week, view, or layout for your preview.
- Download it as PNG, PDF, or ICS.
- Select **Go Back** to return to your saved timetable, when available.

Opening the link does not change your saved timetable.

### Import a Shared Timetable

Importing replaces your saved timetable for the shared semester. Other saved
semesters are kept. Save a share link for your existing timetable before importing
if you want to restore it later.

1. Open the shared link.
2. Review the timetable.
3. Select **Import**.
4. Read the warning.
5. Select **Confirm import**.

The shared classes replace your saved selections for that semester. Hidden courses
are cleared, and the view returns to **All Weeks**.

## Managing Settings and Course Registration Reminders

### Change Timetable Appearance

1. Open **Settings**.
2. Under **Appearance**, choose **Color mode**: **Auto**, **Light**, or **Dark**,
   and a timetable theme.
3. Under **Timetable**, choose **Horizontal** or **Vertical** orientation.
4. Set **Open timetable to**: **All weeks**, **This week**, or **Last viewed**.
   **Last viewed** remembers each semester; **This week** falls back to
   **All weeks** when unavailable.
5. Set **Default class type** to **Full-time** or **Part-time**.
6. Use **Reset** to restore this page’s defaults.

The preview updates as you change settings. Existing timetable selections are
not removed when you change appearance settings.

### Use Course Registration Reminders

1. Open **Settings**.
2. Go to **Reminders**.
3. Set **In-app reminders** to **On**.
4. Open SUSSPlanner near an eCR or add-drop period.

When a reminder is active, a notification appears at the top right of the app.
SUSSPlanner shows only one active registration reminder at a time. The reminder
can change from **Upcoming** to **Open** to **Closing Soon** as the registration
window moves through those phases.

The reminder status uses:

- **Upcoming** when registration starts within the next 7 days.
- **Open** when registration is open and not yet in its final 24 hours.
- **Closing Soon** during the final 24 hours before registration ends.

The reminder schedule is:

- **Upcoming:** 7 days, 3 days, 2 days, 1 day, 12 hours, 6 hours, and 1 hour
  before the window opens.
- **Open:** when the window opens, then every 24 hours while it remains open.
- **Closing Soon:** 24 hours, 12 hours, 6 hours, and 1 hour before the window
  closes.

Use **Reminder schedule** beside the setting to review these intervals.
Reminders use the bundled schedule; confirm registration dates with SUSS.

Turn **In-app reminders** off to disable all course registration reminders in
this browser.

### Dismiss a Reminder

Close a notification to dismiss its current reminder threshold in this browser.

A dismissed threshold stays hidden for the matching registration window. A
reminder can appear again when:

- The next upcoming threshold is crossed.
- The next 24-hour open interval starts.
- The next closing-soon threshold is crossed.
- A later registration window becomes active.
- The bundled registration schedule changes.
- Browser storage is cleared.
- You use another browser or device.

## Common Workflows

### Plan the Next Semester

1. Open **Planner** and review the courses planned for your next semester.
2. Open **Courses** to check details, assessments, and available classes.
3. Open **Timetable** and choose the upcoming semester.
4. Check **Default class type** in **Settings** if you want to change the
   preferred class groups.
5. Add your planned courses.
6. Review clashes and try alternative class groups.
7. Share or download the final timetable.

### Prepare for Course Registration

1. Open **Settings** and confirm **Course Registration Reminders** are on.
2. Open **Planner** to review the modules you intend to register for.
3. When a reminder notification appears, check the registration window shown in
   the notification.
4. Confirm final registration dates and availability through official SUSS
   channels before taking action.

### Compare Different Plans

SUSSPlanner keeps one multi-semester course plan at a time. To compare options:

1. Export a JSON backup of your current Planner before changing it.
2. Rearrange courses and compare semester credit-unit totals.
3. For timetable options, download a PNG or PDF before trying another
   combination.
4. Compare the saved images and clash warnings.

## Frequently Asked Questions

### Do I need an account?

No. SUSSPlanner does not require an account or sign-in.

### Where are my plans saved?

Your timetable, semester planner, GPA Calculator entries, settings, and
reminder dismissals are saved in your current browser.

### Will my plans appear on another device?

No. Plans do not automatically sync between devices or browsers.

### Can I recover a plan after clearing browser data?

Restore a semester plan from an exported JSON backup or saved Planner share
link. Restore a timetable by importing a saved timetable share link. Without
a backup or share link, SUSSPlanner cannot recover cleared plans.

### Can I share my multi-semester course plan?

Yes. Use **Share** in the Planner. See [Share Your Semester Planner](#share-your-semester-planner).

### Does opening a shared link replace my timetable?

No. It opens a read-only preview. Your timetable changes only if you select
**Import** and then **Confirm import**.

### What happens when I import a shared timetable?

It replaces the shared semester’s saved classes, clears hidden courses, and
returns that timetable to **All Weeks**. Other saved semesters are kept.

### What is the difference between hiding and removing a course?

Hiding removes the course from the timetable display but keeps it selected.
Removing deletes it from your timetable.

### Does hiding a course remove its clashes?

No. The course remains selected, so its clashes remain.

### Can SUSSPlanner fix every clash automatically?

No. It shows clashes and available class groups, but a clash-free combination
may not exist.

### How is the default class group chosen?

**Default class type** in **Settings** makes new timetable entries prefer
full-time TG groups or part-time CRN groups. You can switch groups afterward.

### Can I add a course that is not listed?

You can add it as a custom course in **Planner**. It cannot be added to
**Timetable** because it has no class schedule. You can also add a custom
module directly in **GPA Calculator**.

### Where are the calculators?

The calculators are available through **Calculators** in the navigation and the direct `/calculators` route.

### Do Pass/Fail modules count towards the calculator GPA?

No. Current modules marked Pass/Fail are excluded from both Current GPA and
Cumulative GPA. Previously completed CUs should also exclude historical
Pass/Fail modules.

### Can I edit a course in the Planner?

You can edit custom courses. Listed courses cannot be edited.

### How many semesters can I plan?

You can plan between 1 and 20 semesters.

### Why do I not see a course registration reminder?

A reminder appears only when **In-app reminders** are enabled, the current date
is within an upcoming, open, or closing-soon reminder threshold, and that exact
threshold has not already been dismissed in this browser. SUSSPlanner shows at
most one registration reminder at a time, so a more urgent closing-soon or open
reminder can take priority over an upcoming one.

### Are course registration reminders official SUSS notices?

No. They are planning reminders based on the schedule bundled with SUSSPlanner.
Always check official SUSS registration information before registering.

## Troubleshooting

### The Timetable Is Not Loading

1. Check your internet connection.
2. Refresh the page.
3. Try a current version of another browser.
4. If one saved course is affected, remove it and add it again.
5. If the problem continues, report it through the **Git Repo** link at the
   bottom of SUSSPlanner, or use **Feedback**.

### A Shared Link Is Not Working

1. Make sure you received the full link.
2. Ask the sender to select **Share** again and send a fresh link.
3. If the page shows **Invalid shared link**, the link may be incomplete.
4. If only some classes are missing, those class groups may have changed or
   been removed.

### A Course Is Not Appearing in Timetable Search

1. Check that the correct semester is selected.
2. Search using the exact course code.
3. Open **Courses** and check its offered semesters.
4. If it is not offered or has no classes for the selected semester, it cannot
   be added to that timetable.

### A Course Is Missing from the Module Bank

1. Open **Planner**.
2. Select **Show All**.
3. Check whether the course is already assigned to a semester.
4. Search for and add it again if needed.

### My Saved Plan Disappeared

This can happen if browser data was cleared, a private-browsing session ended,
or you changed browsers or devices. If you previously exported a JSON backup,
open **Planner**, select **Backup**, then select **Import** to restore it.
A saved Planner share link can also restore its snapshot. Without a backup or
share link, SUSSPlanner cannot recover a cleared plan.

### My GPA Calculator Entries Disappeared

Calculator entries are stored only in the current browser. They may disappear
if browser data is cleared, a private-browsing session ends, or you change
browsers or devices. The calculator does not provide an export or
restore feature.

### Course Information Is Missing

Some courses may not have complete details, schedules, or assessment
information available in SUSSPlanner.

### A Course Registration Reminder Is Missing

1. Open **Settings**.
2. Confirm **In-app reminders** is **On**.
3. Check whether you previously dismissed the current threshold.
4. Confirm that the registration window is within 7 days of opening, currently
   open, or in its final 24 hours.
5. If more than one registration window is active, check whether another window
   has a more urgent reminder.

## Limitations

- Plans, settings, and reminder dismissals stay in the current browser. There
  are no accounts or automatic sync. Back up plans or save share links before
  clearing browser data.
- Calculator entries are browser-local and cannot be exported,
  imported, shared, or recovered after browser data is cleared.
- GPA and Pass/Fail results are planning estimates. Confirm official GPA and
  Pass/Fail rules with SUSS before making academic decisions.
- The Planner keeps one semester planner at a time.
- Planner share links contain fixed snapshots; later edits do not update them.
  Unsupported browsers and plans too large for a link can use JSON backups.
- Shared timetable links do not include hidden courses, custom colours,
  selected week, layout, or view.
- Shared links support up to 50 selected classes.
- Shared links may become incomplete if classes change or are removed.
- Course, assessment, and class information may change or be incomplete.
- Course registration reminders depend on the bundled registration schedule and
  are not a replacement for official SUSS notices.
- SUSSPlanner can detect clashes but cannot guarantee a clash-free combination.
- The Planner uses drag-and-drop on desktop and tap-to-assign controls on mobile.

## Support

Open **Feedback** to send a private report to the maintainers, or use
[GitHub Issues](https://github.com/Simplificatedd/SUSSplanner/issues) for a public
bug report or feature request.

When reporting an issue:

1. Explain what you were trying to do.
2. List the steps that caused the problem.
3. Include the error message, if one appeared.
4. Include a screenshot when appropriate.
5. State which browser and device you used.

Do not include passwords or other sensitive information in a public report.
