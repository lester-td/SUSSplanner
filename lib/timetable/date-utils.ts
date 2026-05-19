import type { EventKind, SemesterRecord, SemesterWeekRecord } from "./types";

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const START_MINUTES = 8 * 60 + 30;
export const DEFAULT_END_MINUTES = 18 * 60 + 30;
export const MAX_END_MINUTES = 22 * 60;

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions)
{
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(new Date(`${date}T00:00:00`));
}

export function formatCompactDate(date: string)
{
  return formatDate(date, { day: "numeric", month: "short" });
}

export function formatDateRange(startDate: string, endDate: string)
{
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const monthFormat = new Intl.DateTimeFormat("en-SG", { month: "short" });
  const dayFormat = new Intl.DateTimeFormat("en-SG", { day: "numeric" });

  const startMonth = monthFormat.format(start);
  const endMonth = monthFormat.format(end);
  const startDay = dayFormat.format(start);
  const endDay = dayFormat.format(end);

  return startMonth === endMonth
    ? `${startDay} ${startMonth} to ${endDay} ${endMonth}`
    : `${startDay} ${startMonth} to ${endDay} ${endMonth}`;
}

export function formatEventDate(date: string)
{
  return formatDate(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function stripSeconds(time: string)
{
  return time.slice(0, 5);
}

export function toMinutes(time: string)
{
  const [hours, minutes] = stripSeconds(time).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number)
{
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function minutesToLabel(minutes: number)
{
  const [hours, mins] = minutesToTimeString(minutes).split(":");
  return `${hours}:${mins}`;
}

export function formatTimeRange(startTime: string, endTime: string)
{
  return `${stripSeconds(startTime)}-${stripSeconds(endTime)}`;
}

export function formatClassGroupLabel(groupCode: string)
{
  return groupCode;
}

export function formatEventHeading(eventKind: EventKind, eventDate: string)
{
  if (eventKind === "CLASS")
  {
    return formatEventDate(eventDate);
  }

  const label = eventKind.charAt(0) + eventKind.slice(1).toLowerCase();
  return `${label} · ${formatEventDate(eventDate)}`;
}

export function getVisibleEndMinutes(latestEndMinutes: number)
{
  return Math.min(MAX_END_MINUTES, Math.max(DEFAULT_END_MINUTES, latestEndMinutes));
}

export function buildTimeSlots(visibleEndMinutes: number)
{
  const slots: number[] = [];
  for (let minute = START_MINUTES; minute <= visibleEndMinutes; minute += 30)
  {
    slots.push(minute);
  }
  return slots;
}

export function buildWeekLabel(week: SemesterWeekRecord)
{
  return week.weekType === "TEACHING"
    ? `Week ${week.weekNo}`
    : week.label;
}

export function getCurrentSemesterContext(
  semesters: SemesterRecord[],
  semesterWeeks: SemesterWeekRecord[],
  now = new Date(),
)
{
  const today = now.toISOString().slice(0, 10);
  const matchingWeek = semesterWeeks.find(
    (week) => week.startDate <= today && today <= week.endDate,
  );

  if (matchingWeek)
  {
    const semester = semesters.find((item) => item.semesterId === matchingWeek.semesterId) ?? null;
    if (semester)
    {
      return { semester, week: matchingWeek };
    }
  }

  return {
    semester: semesters[0] ?? null,
    week: semesterWeeks.find((week) => week.semesterId === semesters[0]?.semesterId) ?? null,
  };
}

export function getCurrentWeekChip(
  semester: SemesterRecord | null,
  week: SemesterWeekRecord | null,
)
{
  if (!semester)
  {
    return "No semester loaded";
  }

  if (!week)
  {
    return `AY${semester.academicYear}, ${semester.semesterName}`;
  }

  return week.weekType === "TEACHING"
    ? `AY${semester.academicYear}, ${semester.semesterName}, Week ${week.weekNo}`
    : `AY${semester.academicYear}, ${semester.semesterName}, ${week.label}`;
}
