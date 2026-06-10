# SUSSPlanner User Guide

SUSSPlanner helps students explore courses, build a semester timetable, and
forecast a multi-semester study plan. You do not need an account to use it.

## Before You Start

SUSSPlanner saves your timetable and study plan in your browser's local
storage. Your saved data:

- Stays in the browser and device where you created it.
- Is not synchronized between browsers or devices.
- Can be lost if you clear browser storage.
- Is not backed up by a SUSSPlanner account.

Only timetable semester and class selections can be shared through a URL. Your
study plan cannot currently be shared or exported.

## Navigation

The main navigation contains:

| Section | Purpose |
|---|---|
| **Timetable** | Build a timetable, inspect clashes, and export or share it. |
| **Courses** | Search the catalog and inspect course details. |
| **Planner** | Forecast courses and credit units across multiple semesters. |

## Build a Timetable

Open **Timetable** from the navigation.

### Select a Semester and Week

- Use the semester selector above the timetable to choose an academic semester.
- Use the week selector to show **All Weeks** or a specific teaching, study, or
  exam week.
- Use **Show All Weeks** to return to the combined overview after selecting a
  specific week.

Changing semester does not automatically remove your selected courses. If a
saved class group does not exist in the new semester, SUSSPlanner displays a
warning that some saved identifiers no longer match the database.

### Add Courses

1. Choose **FT** or **PT** in the **My Courses** panel.
2. Search for a course by code or name.
3. Select a search result to add it.

SUSSPlanner automatically chooses an available class group when adding a
course. FT mode prefers tutorial-group (`TG`) classes, while PT mode prefers
course-run (`CRN`) classes. Where possible, it prefers a group that does not
clash with your visible timetable.

If a course is unavailable in the selected semester or has no class groups,
SUSSPlanner displays a notice instead of adding it.

### Change a Class Group

When a selected course has alternative groups:

1. Select one of that course's blocks in the timetable.
2. Available alternatives appear in the timetable.
3. Select the preferred alternative block.

Changing the group replaces the existing selection for that course.

### Understand the Timetable

- Course blocks show the course code, class group, time, applicable weeks, and
  delivery mode when space permits.
- Selecting a specific week filters the displayed events to that week.
- Detected timetable clashes are listed above the timetable with their date,
  time, and affected classes.
- Courses marked **ECA** or **No Exam** display that status in **My Courses**.

### Manage Selected Courses

Each card under **My Courses** provides controls to:

- Change the course color.
- Open **View class schedule** to inspect session dates, times, delivery modes,
  and exam details.
- **Hide course** from the timetable without removing it.
- **Show course** after hiding it.
- **Remove course** from the timetable.

You can order selected-course cards by course code, exam, or credit units.
The panel also displays the total selected credit units.

### Change the Display

- Select **Exam Cal** to switch from the class timetable to the exam calendar.
- Select **Timetable** to return to the class view.
- Select **Vertical** or **Horizontal** to change the timetable and course-panel
  layout.

These display preferences are saved locally.

### Reset the Timetable

Select **Reset**, then confirm the reset. This clears selected courses, hidden
courses, and custom course colors for the saved timetable. It keeps the
current semester, selected week, orientation, and view mode.

## Share a Timetable

Select **Share** from the timetable. SUSSPlanner attempts to copy a share URL to
your clipboard. If clipboard access is unavailable, it displays the URL so you
can copy it manually.

A shared link contains:

- The selected semester.
- The selected class-group identifiers.

A shared link does not contain:

- Hidden-course settings.
- Custom colors.
- Selected week.
- Orientation.
- Timetable or exam view preference.

Shared links are limited to 50 selected classes and depend on those class
identifiers continuing to exist in the academic database.

## Open or Import a Shared Timetable

Opening a valid shared link displays a read-only preview. Your existing saved
timetable remains unchanged while previewing it.

From the preview, you can:

- Inspect detected clashes.
- Switch weeks, views, and orientation.
- Export the shared timetable.
- Return to your existing timetable when one is saved.
- Select **Import** to replace your saved timetable selections.

Importing requires confirmation and cannot be undone. It replaces the saved
semester and selected classes, clears hidden classes, and resets the selected
week to **All Weeks**. Existing course colors, orientation, and view mode are
preserved when available.

If a shared link is malformed, SUSSPlanner displays **Invalid shared link**. If
some class identifiers no longer exist, the preview displays a warning and
shows the classes that can still be resolved.

## Export a Timetable

Open **Download** from the timetable and choose:

| Format | Result |
|---|---|
| **PNG** | An image of the currently rendered timetable or exam view. |
| **PDF** | A PDF created from the currently rendered timetable or exam view. |
| **ICS** | A calendar file containing the resolved timetable events. |

PNG and PDF exports reflect the current rendered view. The ICS export contains
calendar events rather than a visual timetable.

## Search and Inspect Courses

Open **Courses** from the navigation.

### Search the Catalog

Search by course code, title, or description. Search results show available
course information such as school, credit units, course level, academic track,
offered semesters, and synopsis.

Available filters include:

- Offered semester.
- Daytime or evening schedule.
- Course level.
- Postgraduate courses.
- GSP/UNE availability.
- Written exam or ECA assessment.
- School.

Select **Reset all** to clear the search filters.

### View Course Details

Select a course result to open its detail page. Depending on available data, the
page shows:

- School, credit units, level, and academic track.
- Synopsis, topics, and learning outcomes.
- Assessment components.
- Offered semesters and available class groups.
- A link to the source synopsis.

Choose a semester to load its available class groups. Select a class group to
view its detailed schedule. When daytime and evening assessment components
differ, choose the relevant schedule type to inspect.

### Add a Course to the Study Plan

Select **Add to Planner** from a course result or course detail page. The button
changes to **In Planner** after the course is added. The course appears
unassigned in the Planner's module bank.

## Build a Multi-Semester Study Plan

Open **Planner** from the navigation. A new plan starts with a target of 130
credit units and 8 semesters.

### Add Courses

Use **Add a Course** in either mode:

- **Search:** find a catalog course, optionally filtered by semester, then
  select it.
- **Custom:** enter a module label, credit units, and semester span, then select
  **Add Custom Module**.

New courses are placed in the **Module Bank** until assigned.

### Arrange the Plan

- Drag a course from the module bank to a semester.
- Drag an assigned course to another semester.
- Drag an assigned course back to the module bank to unassign it.
- Drag a course to the trash area to delete it. Deletion cannot be undone.
- Select **Show All** to display assigned courses in the module bank as
  reference entries; select **Show Available** to show only unassigned courses.
  Assigned reference entries cannot be dragged from the module bank.

Courses spanning multiple semesters show a semester-span label and appear as
continuing in later semesters. A multi-semester course moved too near the end
of the plan is placed in the latest semester where its full span fits.

### Adjust Planner Settings

- Change **Target Credits** to update allocation progress.
- Change **Semesters** or select **Add Semester** to adjust the plan length.
- Delete a semester only when it is empty and not occupied by a continuing
  multi-semester course.
- Edit custom modules to change their label, credit units, or semester span.

The planner supports 1-20 semesters. Credit allocation counts assigned courses;
courses still in the module bank are not included in allocated-credit progress.

### Reset the Study Plan

Select **Reset Planner**, then confirm. This clears all modules, assignments,
and planner settings and restores the default plan. The reset cannot be undone.

## Troubleshooting

### My saved plan disappeared

Timetable and study-plan data is stored only in browser local storage. Clearing
site data, using private browsing, changing browsers, or changing devices can
make the saved data unavailable.

### A selected class no longer appears

The selected class identifier may no longer exist for the chosen semester.
Check the warning above the timetable, remove the affected course, and add it
again to select a current class group.

### A shared link does not open correctly

The link may be incomplete, malformed, or refer to class groups that no longer
exist. Ask the sender to create a fresh link from **Share**.

### A course has missing details

Course, class, assessment, and schedule information depends on the academic
data currently loaded by the maintainers. Some source records may not provide
every field.

### My study plan cannot be shared or exported

Only semester timetables currently support sharing and export. The
multi-semester study plan has no share, import, or export feature.

## Important Limitations

- SUSSPlanner has no student accounts, cloud synchronization, or server-side
  backup of personal planner data.
- Shared timetable links do not preserve display preferences or hidden classes.
- Assessment components represent the latest available strategy by course and
  schedule type, rather than historical semester-specific assessments.
- Academic data may change after a link or plan is created.
