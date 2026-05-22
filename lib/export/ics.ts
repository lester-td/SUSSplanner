import { stripSeconds } from "@/lib/timetable/date-utils";
import type { SemesterRecord, TimetableEventRecord } from "@/lib/timetable/types";

function escapeIcsText(value: string)
{
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsDateTime(date: string, time: string)
{
  const normalizedTime = stripSeconds(time).replace(/:/g, "");
  return `${date.replace(/-/g, "")}T${normalizedTime}00`;
}

export function buildIcs(semester: SemesterRecord | null, events: TimetableEventRecord[])
{
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SUSSplanner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(semester ? `SUSS Planner ${semester.semesterName}` : "SUSS Planner")}`,
  ];

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  for (const event of events)
  {
    const summary = `${event.courseCode} ${event.groupCodeType} ${event.groupCode}${event.eventKind === "EXAM" ? " EXAM" : ""}`;
    const description = [
      event.courseName ? `Course: ${event.courseName}` : null,
      `Kind: ${event.eventKind}`,
      event.eventMode ? `Mode: ${event.eventMode}` : null,
      event.weekLabel ? `Week: ${event.weekLabel}` : null,
      event.remarks ? `Notes: ${event.remarks}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:sussplanner-${event.eventId}@sussplanner.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Singapore:${toIcsDateTime(event.eventDate, event.startTime)}`,
      `DTEND;TZID=Asia/Singapore:${toIcsDateTime(event.eventDate, event.endTime)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
