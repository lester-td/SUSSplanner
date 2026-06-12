import { normalizeStudyPlanState } from "@/lib/planner/storage";
import type { StudyPlanCourse, StudyPlanState } from "@/lib/planner/types";

function escapeHtml(value: string)
{
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCredits(value: number)
{
  return `${Number(value.toFixed(1)).toString()} CU`;
}

function courseRow(course: StudyPlanCourse)
{
  const schoolName = course.schoolName
    ? `<span class="course-school">${escapeHtml(course.schoolName)}</span>`
    : "";
  const semesterSpan = course.semesterSpan > 1
    ? `<span class="course-span">${course.semesterSpan} semesters</span>`
    : "";

  return `
    <li class="course">
      <div>
        <strong>${escapeHtml(course.courseCode)}</strong>
        <span class="course-name">${escapeHtml(course.courseName)}</span>
        ${schoolName}
      </div>
      <div class="course-meta">
        ${semesterSpan}
        <strong>${formatCredits(course.creditUnits)}</strong>
      </div>
    </li>
  `;
}

function semesterSection(courses: StudyPlanCourse[], semesterIndex: number)
{
  const semesterCourses = courses
    .filter((course) => course.assignedSemester === semesterIndex)
    .sort((left, right) => left.courseCode.localeCompare(right.courseCode));
  const credits = semesterCourses.reduce((sum, course) => sum + course.creditUnits, 0);

  return `
    <section class="semester">
      <div class="section-heading">
        <h2>Semester ${semesterIndex + 1}</h2>
        <span>${formatCredits(credits)}</span>
      </div>
      ${semesterCourses.length > 0
        ? `<ul>${semesterCourses.map(courseRow).join("")}</ul>`
        : `<p class="empty">No modules planned.</p>`}
    </section>
  `;
}

export function openStudyPlanPrintView(state: StudyPlanState)
{
  const plan = normalizeStudyPlanState(state);
  const assignedCourses = plan.courses.filter((course) => course.assignedSemester !== null);
  const unassignedCourses = plan.courses
    .filter((course) => course.assignedSemester === null)
    .sort((left, right) => left.courseCode.localeCompare(right.courseCode));
  const assignedCredits = assignedCourses.reduce((sum, course) => sum + course.creditUnits, 0);
  const generatedAt = new Intl.DateTimeFormat("en-SG", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SUSSPlanner Semester Plan</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #edf1f7;
        color: #131a26;
        font-family: Arial, sans-serif;
        line-height: 1.4;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        justify-content: center;
        padding: 12px;
        background: rgba(237, 241, 247, 0.96);
        border-bottom: 1px solid #c3ccdc;
      }
      .toolbar button {
        border: 0;
        border-radius: 8px;
        padding: 10px 16px;
        background: #001e60;
        color: white;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 18px auto;
        padding: 14mm;
        background: white;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
      }
      header {
        padding-bottom: 14px;
        border-bottom: 3px solid #001e60;
      }
      h1, h2, p { margin: 0; }
      h1 { color: #001e60; font-size: 25px; }
      .subtitle { margin-top: 4px; color: #42516a; font-size: 12px; }
      .summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin: 16px 0;
      }
      .summary-item {
        padding: 10px;
        border: 1px solid #c3ccdc;
        border-radius: 8px;
        background: #f3f6fb;
      }
      .summary-label {
        display: block;
        color: #42516a;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        white-space: nowrap;
        text-transform: uppercase;
      }
      .summary-value { display: block; margin-top: 3px; font-size: 15px; }
      .semester {
        margin-top: 12px;
        border: 1px solid #c3ccdc;
        border-radius: 8px;
        overflow: hidden;
        break-inside: avoid;
      }
      .section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #e7edfb;
        color: #001e60;
      }
      .section-heading h2 { font-size: 14px; }
      .section-heading span { font-size: 11px; font-weight: 700; }
      ul { margin: 0; padding: 0; list-style: none; }
      .course {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border-top: 1px solid #dde6f2;
        font-size: 11px;
      }
      .course:first-child { border-top: 0; }
      .course-name, .course-school { display: block; margin-top: 1px; color: #42516a; }
      .course-school { font-size: 9px; }
      .course-meta { flex-shrink: 0; text-align: right; }
      .course-span { display: block; margin-bottom: 2px; color: #42516a; font-size: 9px; }
      .empty { padding: 8px 10px; color: #687488; font-size: 11px; }
      footer { margin-top: 16px; color: #687488; font-size: 9px; text-align: center; }
      @media print {
        body { background: white; }
        .toolbar { display: none; }
        .page {
          width: auto;
          min-height: 0;
          margin: 0;
          padding: 0;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button type="button" onclick="window.print()">Print / Save as PDF</button>
    </div>
    <main class="page">
      <header>
        <h1>Semester Plan</h1>
        <p class="subtitle">Generated by SUSSPlanner on ${escapeHtml(generatedAt)}</p>
      </header>
      <div class="summary">
        <div class="summary-item">
          <span class="summary-label">Target Credits</span>
          <strong class="summary-value">${formatCredits(plan.totalCreditsGoal)}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">Assigned Credits</span>
          <strong class="summary-value">${formatCredits(assignedCredits)}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">Total Modules</span>
          <strong class="summary-value">${plan.courses.length}</strong>
        </div>
        <div class="summary-item">
          <span class="summary-label">Semesters</span>
          <strong class="summary-value">${plan.numSemesters}</strong>
        </div>
      </div>
      ${Array.from({ length: plan.numSemesters }, (_, index) => semesterSection(plan.courses, index)).join("")}
      ${unassignedCourses.length > 0
        ? `<section class="semester">
            <div class="section-heading">
              <h2>Module Bank</h2>
              <span>${unassignedCourses.length} unassigned</span>
            </div>
            <ul>${unassignedCourses.map(courseRow).join("")}</ul>
          </section>`
        : ""}
      <footer>SUSSPlanner semester plan</footer>
    </main>
  </body>
</html>`;
  const blobUrl = window.URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const printWindow = window.open(blobUrl, "_blank");

  if (!printWindow)
  {
    window.URL.revokeObjectURL(blobUrl);
    return false;
  }

  printWindow.opener = null;
  window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
  return true;
}
