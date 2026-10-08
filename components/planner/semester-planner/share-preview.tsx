import { BookIcon, ChevronRightIcon, ContinueIcon } from "@/components/planner/icons";
import { formatCredits, sortCourses } from "./formatting";
import type { SemesterPlannerCourse, SemesterPlannerState } from "@/lib/planner/types";

export function SemesterPlannerPreviewSummary({ plan }: { plan: SemesterPlannerState })
{
  const assigned = plan.courses.filter((course) => course.assignedSemester !== null);
  const credits = assigned.reduce((sum, course) => sum + course.creditUnits, 0);
  return (
    <dl className="planner-share-preview-summary mt-3 grid grid-cols-3 gap-3 rounded-[0.75rem] border p-3">
      <div>
        <dt className="text-[11px] text-[var(--on-surface-variant)]">Credits</dt>
        <dd className="mt-0.5 text-[15px] font-semibold text-[var(--primary)]">{formatCredits(credits)}</dd>
        <dd className="text-[11px] text-[var(--on-surface-variant)]">of {formatCredits(plan.totalCreditsGoal)}</dd>
      </div>
      <div>
        <dt className="text-[11px] text-[var(--on-surface-variant)]">Courses</dt>
        <dd className="mt-0.5 text-[15px] font-semibold">{plan.courses.length}</dd>
        <dd className="text-[11px] text-[var(--on-surface-variant)]">{plan.courses.length - assigned.length} unassigned</dd>
      </div>
      <div>
        <dt className="text-[11px] text-[var(--on-surface-variant)]">Semesters</dt>
        <dd className="mt-0.5 text-[15px] font-semibold">{plan.numSemesters}</dd>
      </div>
    </dl>
  );
}

function PreviewCourse({ course, continuing = false }: { course: SemesterPlannerCourse; continuing?: boolean })
{
  return (
    <li className={`planner-share-preview-course ${continuing ? "planner-share-preview-course--continuing" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
        <span className="font-semibold">{course.courseCode}</span>
        {course.source === "manual" ? <span className="text-[10px] text-[var(--on-surface-variant)]">Custom</span> : null}
        <span className="ml-auto text-[11px] font-semibold text-[var(--primary)]">{continuing ? "Continuing" : formatCredits(course.creditUnits)}</span>
      </div>
      <p className="mt-0.5 text-[12px] leading-[18px] text-[var(--on-surface-variant)]">{course.courseName}</p>
      {continuing ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--on-surface-variant)]"><ContinueIcon className="h-3 w-3 shrink-0" /> Continues from Semester {(course.assignedSemester ?? 0) + 1}</p>
      ) : course.semesterSpan > 1 ? <p className="mt-1 text-[11px] text-[var(--on-surface-variant)]">Spans {course.semesterSpan} semesters</p> : null}
    </li>
  );
}

export function SemesterPlannerSharePreview({ plan }: { plan: SemesterPlannerState })
{
  const courses = sortCourses(plan.courses);
  const bank = courses.filter((course) => course.assignedSemester === null);
  return (
    <section aria-label="Shared plan preview" className="planner-share-preview">
      {Array.from({ length: plan.numSemesters }, (_, index) => {
        const starting = courses.filter((course) => course.assignedSemester === index);
        const continuing = courses.filter((course) => course.assignedSemester !== null
          && course.assignedSemester < index && course.assignedSemester + course.semesterSpan > index);
        const credits = starting.reduce((sum, course) => sum + course.creditUnits, 0);
        const count = starting.length + continuing.length;
        return (
          <details key={index} className="planner-share-preview-group" open={index === 0}>
            <summary className="planner-share-preview-heading">
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">Semester {index + 1}</span>
                <span className="block text-[11px] text-[var(--on-surface-variant)]">{count} {count === 1 ? "course" : "courses"}</span>
              </span>
              <span className="ml-auto shrink-0 text-[12px] font-semibold text-[var(--primary)]">{formatCredits(credits)}</span>
              <ChevronRightIcon className="h-4 w-4 shrink-0" />
            </summary>
            <div className="planner-share-preview-group-body">
              {count === 0 ? <p className="px-1 py-2 text-[12px] text-[var(--on-surface-variant)]">No courses assigned yet.</p> : (
                <ul className="space-y-1">
                  {continuing.map((course) => <PreviewCourse key={course.id} course={course} continuing />)}
                  {starting.map((course) => <PreviewCourse key={course.id} course={course} />)}
                </ul>
              )}
            </div>
          </details>
        );
      })}
      <details className="planner-share-preview-group planner-share-preview-bank" open={bank.length > 0}>
        <summary className="planner-share-preview-heading">
          <BookIcon className="h-4 w-4 shrink-0 text-[var(--primary)]" />
          <span className="text-[13px] font-semibold">Module Bank ({bank.length})</span>
          <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0" />
        </summary>
        <div className="planner-share-preview-group-body">
          {bank.length === 0 ? <p className="px-1 py-2 text-[12px] text-[var(--on-surface-variant)]">No unassigned courses.</p> : (
            <ul className="space-y-1">{bank.map((course) => <PreviewCourse key={course.id} course={course} />)}</ul>
          )}
        </div>
      </details>
    </section>
  );
}
