"use client";

import { XIcon } from "@/components/planner/icons";
import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import type { ClassEventWithWeekRecord } from "@/lib/timetable/types";

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

function formatExamDeliveryMode(event: ClassEventWithWeekRecord)
{
  if (event.eventMode?.trim())
  {
    return event.eventMode;
  }

  return "Written Exam";
}

export function ClassScheduleModalContent({
  courseCode,
  courseName,
  classGroupLabel,
  events,
  onClose,
}: {
  courseCode: string;
  courseName: string | null;
  classGroupLabel: string;
  events: ClassEventWithWeekRecord[];
  onClose: () => void;
})
{
  const classEvents = events
    .filter((event) => event.eventKind === "CLASS")
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`));
  const examEvent = events
    .filter((event) => event.eventKind === "EXAM")
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`))[0] ?? null;

  return (
    <div className="relative space-y-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-0 top-0 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.35rem] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
        aria-label="Close modal"
        title="Close"
      >
        <XIcon className="h-4 w-4" />
      </button>
      <div className="border-b border-[var(--outline-variant)] pb-3">
        <div className="pr-9">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[24px] font-black leading-none tracking-[-0.04em] text-[var(--primary)]">{courseCode}</span>
            <span className="text-[22px] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--on-surface)]">{courseName ?? "Untitled course"}</span>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="border-l-2 border-[var(--primary)] bg-[var(--surface-container-low)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Class Group</p>
            <p className="mt-1 text-[16px] font-semibold leading-6 text-[var(--on-surface)]">{classGroupLabel}</p>
          </div>
          <div className="border-l-2 border-[var(--primary)] bg-[var(--surface-container-low)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--on-surface-variant)]">Sessions</p>
            <p className="mt-1 text-[16px] font-semibold leading-6 text-[var(--on-surface)]">
              {classEvents.length} {classEvents.length === 1 ? "session" : "sessions"}
            </p>
          </div>
        </div>
      </div>

      {classEvents.length === 0 ? (
        <p className="border border-dashed border-[var(--outline-variant)] px-4 py-4 text-[13px] leading-5 text-[var(--on-surface-variant)]">
          No class schedule events for this course.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--outline-variant)] bg-[var(--surface-container-low)]">
          <table className="min-w-full border-collapse text-left text-[13px] leading-5">
            <thead className="bg-[var(--surface-container-high)] text-[var(--on-surface)]">
              <tr>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Week</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Date</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Time</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Delivery mode</th>
              </tr>
            </thead>
            <tbody>
              {classEvents.map((event) => (
                <tr key={event.eventId} className="text-[var(--on-surface)] odd:bg-[var(--surface)]">
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{event.weekLabel ?? "-"}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatEventDate(event.eventDate)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatTimeRange(event.startTime, event.endTime)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{event.eventMode ?? "-"}</td>
                </tr>
              ))}
              {examEvent ? (
                <tr className="bg-[var(--surface-container-high)] text-[var(--on-surface)]">
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">{formatExamWeekLabel(examEvent)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatEventDate(examEvent.eventDate)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatTimeRange(examEvent.startTime, examEvent.endTime)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-medium">{formatExamDeliveryMode(examEvent)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
