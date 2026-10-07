"use client";

import Link from "next/link";

import { ArrowUpRightIcon } from "@/components/planner/icons";
import { formatCampusNames, getEventCampusCodes } from "@/lib/timetable/campus";
import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import type { ClassEventWithWeekRecord } from "@/lib/timetable/types";

export function formatClassScheduleTitle(classGroupLabel: string, events: ClassEventWithWeekRecord[])
{
  const sessionCount = events.filter((event) => event.eventKind === "CLASS").length;
  return classGroupLabel + " — " + sessionCount + " " + (sessionCount === 1 ? "Session" : "Sessions");
}

function formatExamWeekLabel(event: ClassEventWithWeekRecord)
{
  if (event.weekLabel?.trim())
  {
    return event.weekLabel.trim();
  }

  if (event.weekNo !== null)
  {
    return `Exam Week ${event.weekNo}`;
  }

  return "Exam";
}

export function ClassScheduleModalContent({
  courseCode,
  courseName,
  courseLabel,
  events,
  selectedSemesterId,
  showViewCourseButton = true,
}: {
  courseCode: string;
  courseName: string | null;
  courseLabel?: string;
  events: ClassEventWithWeekRecord[];
  selectedSemesterId?: number | null;
  showViewCourseButton?: boolean;
})
{
  const courseHref = selectedSemesterId !== null && selectedSemesterId !== undefined
    ? `/courses/${courseCode}?semesterId=${selectedSemesterId}`
    : `/courses/${courseCode}`;
  const classEvents = events
    .filter((event) => event.eventKind === "CLASS")
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`));
  const examEvent = events
    .filter((event) => event.eventKind === "EXAM")
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`))[0] ?? null;
  const showCampus = [...classEvents, ...(examEvent ? [examEvent] : [])]
    .some(event => getEventCampusCodes(event).length > 0);

  return (
    <div className="relative space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 border-b border-[var(--outline-variant)] pb-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pb-3">
        <div className="min-w-0 space-y-2 sm:space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 sm:gap-x-3">
            <span className="text-[22px] font-black leading-none tracking-[-0.04em] text-[var(--primary)] sm:text-[24px]">{courseLabel ?? courseCode}</span>
            <span className="text-[19px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--on-surface)] sm:text-[22px]">{courseName ?? "Untitled course"}</span>
          </div>
        </div>
        {showViewCourseButton ? (
          <div className="shrink-0">
            <Link
              href={courseHref}
              className="inline-flex items-center gap-1.5 rounded-[0.5rem] bg-[var(--primary)] px-2.5 py-1.5 text-[12px] font-medium leading-4 text-on-primary transition-colors hover:bg-[var(--primary-container)] hover:text-on-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:px-3 sm:py-2"
            >
              <ArrowUpRightIcon className="h-4 w-4" />
              View Course
            </Link>
          </div>
        ) : null}
      </div>

      {classEvents.length === 0 ? (
        <p className="border border-dashed border-[var(--outline-variant)] px-4 py-4 text-[13px] leading-5 text-[var(--on-surface-variant)]">
          No class schedule events for this course.
        </p>
      ) : (
        <div className="class-schedule-table -mx-2 overflow-x-auto border sm:mx-0">
          <table className="min-w-full border-collapse text-left text-[13px] leading-5">
            <thead className="class-schedule-table__heading text-[var(--on-surface)]">
              <tr>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Week</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Date</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Time</th>
                {showCampus ? <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Campus</th> : null}
              </tr>
            </thead>
            <tbody>
              {classEvents.map((event) => (
                <tr key={event.eventId} className="text-[var(--on-surface)]">
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{event.weekLabel ?? "-"}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatEventDate(event.eventDate)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatTimeRange(event.startTime, event.endTime)}</td>
                  {showCampus ? <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatCampusNames(getEventCampusCodes(event))}</td> : null}
                </tr>
              ))}
              {examEvent ? (
                <tr className="class-schedule-table__exam text-[var(--on-surface)]">
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">{formatExamWeekLabel(examEvent)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatEventDate(examEvent.eventDate)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatTimeRange(examEvent.startTime, examEvent.endTime)}</td>
                  {showCampus ? <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatCampusNames(getEventCampusCodes(examEvent))}</td> : null}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
