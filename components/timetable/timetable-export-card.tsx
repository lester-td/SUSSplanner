"use client";

import { forwardRef } from "react";

import { CalendarIcon, ListIcon, SchoolIcon } from "@/components/planner/icons";
import { ExamCalendar } from "@/components/timetable/exam-calendar";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { buildTimeSlots } from "@/lib/timetable/date-utils";
import { getExportExamLabel, getExportTimeRange, type ExportCourse } from "@/lib/export/timetable-model";
import type { ExamCard, SemesterRecord, TimetableBlock } from "@/lib/timetable/types";

type TimetableExportCardProps = {
  semester: SemesterRecord | null;
  weekLabel: string;
  viewMode: "class" | "exam";
  orientation: "horizontal" | "vertical";
  blocks: TimetableBlock[];
  examCards: ExamCard[];
  courses: ExportCourse[];
  colorByShareKey: Map<string, string>;
  dayDateByDay?: Record<number, string>;
  showAllWeeks: boolean;
};

export const TimetableExportCard = forwardRef<HTMLDivElement, TimetableExportCardProps>(function TimetableExportCard({
  semester, weekLabel, viewMode, orientation, blocks, examCards, courses, colorByShareKey, dayDateByDay = {}, showAllWeeks,
}, ref)
{
  const { endMinutes } = getExportTimeRange(blocks);
  const horizontal = orientation === "horizontal";
  const totalCredits = courses.reduce((sum, course) => sum + (course.creditUnits ?? 0), 0);

  return (
    <div className="pointer-events-none fixed -left-[10000px] top-0 z-[-1]" aria-hidden="true">
      <div ref={ref} className={`timetable-export-card ${horizontal ? "timetable-export-card--horizontal" : "timetable-export-card--vertical"} w-[1200px] bg-[var(--surface-container-lowest)] p-6 text-[var(--on-surface)]`}>
        <header className="timetable-export-card__header mb-4 flex items-end justify-between border-b border-[var(--outline-variant)] pb-3">
          <div>
            <div className="text-[25px] font-bold leading-8">{viewMode === "exam" ? "Exam Calendar" : "Timetable"}</div>
            <div className="mt-1 text-[14px] text-[var(--on-surface-variant)]">
              {semester ? `Academic Year ${semester.academicYear} · ${semester.semesterName}` : "Semester unavailable"}
            </div>
          </div>
          <div className="text-[14px] font-semibold text-[var(--on-surface-variant)]">{viewMode === "exam" ? "All exams" : weekLabel}</div>
        </header>

        <div className={`timetable-export-card__body ${horizontal ? "flex flex-col gap-4" : "grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-4"}`}>
          <div className="timetable-export-card__main min-w-0 w-full">
            <div className="timetable-export-card__main-content">
              {viewMode === "class" ? (
                <TimetableCanvas
                  blocks={blocks}
                  blockColorByKey={colorByShareKey}
                  isHorizontal={horizontal}
                  timeSlots={buildTimeSlots(endMinutes)}
                  visibleEndMinutes={endMinutes}
                  showAllWeeks={showAllWeeks}
                  dayDateByDay={dayDateByDay}
                  activeShareKey={null}
                  deEmphasisMode="none"
                  activeCourseCode={null}
                  courseCanPickByCode={{}}
                  isPickMode={false}
                  suppressActiveOutline
                  onBlockClick={() => undefined}
                  showCurrentTime={false}
                  forceDesktop
                />
              ) : (
                <ExamCalendar cards={examCards} colorByShareKey={colorByShareKey} undatedExams={courses.filter((course) => course.examStatus === "undated" && !course.hidden)} forceTwoColumns />
              )}
            </div>
          </div>

          <aside className={`timetable-export-card__aside ${horizontal ? "w-full border-t border-[var(--outline-variant)] pt-3" : "min-w-0 w-full border-l border-[var(--outline-variant)] pl-4"}`}>
            <div className="timetable-export-card__aside-content">
              <div className="mb-2 text-[18px] font-semibold leading-6">My Courses</div>
              <div className={horizontal ? "grid grid-cols-4 gap-2" : "space-y-2"}>
                {courses.map((course) => (
                  <article
                    key={course.shareKey}
                    className={`relative overflow-hidden rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-2.5 pl-4 ${course.hidden ? "opacity-60" : ""}`}
                  >
                    <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: course.color }} />
                    <div className="flex items-start gap-2">
                      <span className="mt-1 h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: course.color }} />
                      <div className="min-w-0 text-[13px] leading-5">
                        <span className="font-extrabold">{course.courseCode}</span>{" "}
                        <span>{course.courseName ?? "Untitled course"}</span>
                        {course.hidden ? <span className="ml-1 font-semibold text-[var(--on-surface-variant)]">(hidden)</span> : null}
                      </div>
                    </div>
                    {course.continuationLabel ? (
                      <div className="mt-1 pl-5 text-[12px] font-semibold leading-[18px] text-[var(--on-surface)]">{course.continuationLabel}</div>
                    ) : null}
                    <div className="mt-1 space-y-0.5 text-[12px] leading-[18px] text-[var(--on-surface-variant)]">
                      <div className="flex items-start gap-1.5"><ListIcon className="mt-px h-4 w-4 shrink-0" /><span><span className="font-semibold text-[var(--on-surface)]">Group:</span> {course.groupCode}</span></div>
                      <div className="flex items-start gap-1.5"><CalendarIcon className="mt-px h-4 w-4 shrink-0" /><span>{course.examStatus === "dated" ? <><span className="font-semibold text-[var(--on-surface)]">Exam:</span> {getExportExamLabel(course)}</> : <span className="font-bold text-[var(--on-surface)]">{getExportExamLabel(course)}</span>}</span></div>
                      {course.examGuidance ? <div className="pl-[22px] text-[11px] leading-4">{course.examGuidance}</div> : null}
                      <div className="flex items-start gap-1.5"><SchoolIcon className="mt-px h-4 w-4 shrink-0" /><span><span className="font-semibold text-[var(--on-surface)]">Credit Units:</span> {(course.creditUnits ?? 0).toFixed(1)}</span></div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-3 flex gap-8 border-t border-[var(--outline-variant)] pt-3 text-[12px]">
                <div><div className="text-[var(--on-surface-variant)]">Total Credit Units</div><div className="text-[17px] font-bold">{totalCredits.toFixed(1)} CU</div></div>
                <div><div className="text-[var(--on-surface-variant)]">Total Courses</div><div className="text-[17px] font-bold">{courses.length}</div></div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
});
