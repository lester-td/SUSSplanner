"use client";

import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import type { ClassEventWithWeekRecord } from "@/lib/timetable/types";

export function ClassScheduleModalContent({
  courseCode,
  courseName,
  classGroupLabel,
  events,
}: {
  courseCode: string;
  courseName: string | null;
  classGroupLabel: string;
  events: ClassEventWithWeekRecord[];
})
{
  const classEvents = events
    .filter((event) => event.eventKind === "CLASS")
    .sort((left, right) => `${left.eventDate}${left.startTime}`.localeCompare(`${right.eventDate}${right.startTime}`));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] leading-5">
        <span className="font-semibold text-black">{courseCode}</span>
        <span className="font-bold text-[var(--on-surface)]">{courseName ?? "Untitled course"}</span>
      </div>
      <div className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
        {classGroupLabel}
      </div>

      {classEvents.length === 0 ? (
        <p className="border border-dashed border-[var(--outline-variant)] px-3 py-4 text-[13px] leading-5 text-[var(--on-surface-variant)]">
          No class schedule events for this course.
        </p>
      ) : (
        <div className="overflow-x-auto border border-[var(--outline-variant)]">
          <table className="min-w-full border-collapse text-left text-[13px] leading-5">
            <thead className="bg-[var(--surface-container-low)] text-[var(--on-surface)]">
              <tr>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Date</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Time</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Week</th>
                <th className="border-b border-[var(--outline-variant)] px-3 py-2.5 font-semibold">Delivery mode</th>
              </tr>
            </thead>
            <tbody>
              {classEvents.map((event) => (
                <tr key={event.eventId} className="text-[var(--on-surface)]">
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatEventDate(event.eventDate)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{formatTimeRange(event.startTime, event.endTime)}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{event.weekLabel ?? "-"}</td>
                  <td className="border-b border-[var(--outline-variant)] px-3 py-2">{event.eventMode ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
