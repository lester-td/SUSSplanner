import Link from "next/link";

import { normalizeRichTextList } from "@/lib/timetable/timetable-utils";
import type {
  AssessmentComponentRecord,
  CourseClassRecord,
  CourseRecord,
  SemesterRecord,
  SemesterWeekRecord,
} from "@/lib/timetable/types";
import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";

export function CourseDetailPage({
  course,
  semesters,
  selectedSemesterId,
  classes,
  assessments,
}: {
  course: CourseRecord;
  semesters: SemesterRecord[];
  selectedSemesterId?: number;
  classes: CourseClassRecord[];
  assessments: AssessmentComponentRecord[];
})
{
  const topics = normalizeRichTextList(course.courseTopics);
  const outcomes = normalizeRichTextList(course.learningOutcomes);

  return (
    <div className="px-4 py-6 md:px-[16px]">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[12px] font-semibold leading-4 text-[var(--primary)]">{course.courseCode}</p>
              <h1 className="mt-1 text-[28px] font-semibold leading-9 tracking-[-0.01em] text-[var(--on-surface)]">{course.courseName ?? "Untitled course"}</h1>
              <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">{course.schoolName ?? "School unavailable"}</p>
            </div>
            <div className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-3 text-[12px] leading-4 text-[var(--on-surface-variant)]">
              <div>{course.creditUnits?.toFixed(1) ?? "0.0"} CU</div>
              <div className="mt-1">{course.courseLevel ?? "Level unavailable"}</div>
              <div className="mt-1">{course.isPostgraduate ? "Postgraduate" : "Undergraduate"}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[12px] leading-4 text-[var(--on-surface-variant)]">
            <span className="rounded-[999px] bg-[var(--surface-container-low)] px-3 py-1">{course.presentationPattern ?? "Pattern unavailable"}</span>
            {course.synopsisUrl ? (
              <a href={course.synopsisUrl} target="_blank" rel="noreferrer" className="rounded-[999px] bg-[var(--primary-fixed)] px-3 py-1 text-[var(--primary)]">
                Official synopsis
              </a>
            ) : null}
          </div>

          {course.courseSynopsis ? (
            <div className="mt-5 rounded-[0.5rem] bg-[var(--surface-container-low)] p-4 text-[14px] leading-6 text-[var(--on-surface)]">
              {course.courseSynopsis}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section className="space-y-4">
            <article className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Topics</h2>
              {topics.length > 0 ? (
                <ul className="mt-3 space-y-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                  {topics.map((topic) => <li key={topic}>• {topic}</li>)}
                </ul>
              ) : (
                <p className="mt-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">No topics available.</p>
              )}
            </article>

            <article className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Learning Outcomes</h2>
              {outcomes.length > 0 ? (
                <ul className="mt-3 space-y-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                  {outcomes.map((outcome) => <li key={outcome}>• {outcome}</li>)}
                </ul>
              ) : (
                <p className="mt-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">No learning outcomes available.</p>
              )}
            </article>
          </section>

          <section className="space-y-4">
            <article className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Available classes</h2>
                <form action={`/courses/${course.courseCode}`} method="get" className="flex items-center gap-2">
                  <select name="semesterId" defaultValue={selectedSemesterId ? String(selectedSemesterId) : ""} className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-3 py-2 text-[12px] font-medium leading-4 text-[var(--on-surface)]">
                    <option value="">All semesters</option>
                    {semesters.map((semester) => (
                      <option key={semester.semesterId} value={semester.semesterId}>{semester.semesterName} ({semester.academicYear})</option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-[0.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]">
                    Apply
                  </button>
                </form>
              </div>

              <div className="mt-4 space-y-3">
                {classes.map((group) => (
                  <article key={group.classId} className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[14px] font-semibold leading-5 text-[var(--on-surface)]">{group.groupCodeType} {group.groupCode}</h3>
                        <p className="mt-1 text-[12px] leading-4 text-[var(--on-surface-variant)]">{group.scheduleType} · {group.creditUnits?.toFixed(1) ?? "0.0"} CU</p>
                      </div>
                      <Link href="/planner" className="rounded-[0.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)]">
                        Open in planner
                      </Link>
                    </div>
                    <div className="mt-3 space-y-2">
                      {group.events.map((event) => (
                        <div key={event.eventId} className="rounded-[0.5rem] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] leading-4 text-[var(--on-surface-variant)]">
                          <div className="font-semibold text-[var(--on-surface)]">{event.eventKind} · {formatEventDate(event.eventDate)}</div>
                          <div>{formatTimeRange(event.startTime, event.endTime)} · {event.venue ?? event.eventMode ?? "TBA"}</div>
                          {event.weekLabel ? <div>{event.weekLabel}</div> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}

                {classes.length === 0 ? (
                  <div className="rounded-[0.5rem] border-2 border-dashed border-[var(--outline-variant)] px-4 py-3 text-[14px] leading-5 text-[var(--on-surface-variant)]">
                    No classes found for this course under the selected semester filter.
                  </div>
                ) : null}
              </div>
            </article>

            <article className="rounded-[0.75rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <h2 className="text-[18px] font-semibold leading-6 text-[var(--on-surface)]">Assessment components</h2>
              <div className="mt-4 space-y-2">
                {assessments.map((component) => (
                  <div key={component.componentId} className="rounded-[0.5rem] bg-[var(--surface-container-low)] px-3 py-2 text-[13px] leading-5 text-[var(--on-surface)]">
                    <div className="font-semibold">{component.componentName}</div>
                    <div className="text-[var(--on-surface-variant)]">{component.scheduleType} · {component.componentGroup} · {component.weightPercentage.toFixed(2)}%</div>
                    {component.assessmentMode ? <div className="text-[var(--on-surface-variant)]">{component.assessmentMode}</div> : null}
                  </div>
                ))}
                {assessments.length === 0 ? (
                  <p className="text-[14px] leading-5 text-[var(--on-surface-variant)]">No assessment data available.</p>
                ) : null}
              </div>
            </article>
          </section>
        </div>
      </div>
    </div>
  );
}
