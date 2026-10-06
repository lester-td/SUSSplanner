import type { ClassEventWithWeekRecord, CourseClassRecord, SemesterRecord, SemesterWeekRecord, TimetableData } from "./types";
import { detectTimetableClashes } from "./clash-detection";

export function isClassStartingInSemester(group: CourseClassRecord): boolean
{
  // Classes without dated sessions remain selectable. A class containing only
  // another cohort's completion sessions is not a new offering in this term.
  return group.events.length === 0
    || group.events.some(event => (event.startSemesterId ?? event.semesterId) === group.semesterId);
}

// A class can contain sessions spanning terms. Its semesterId alone does not
// establish that every attached session belongs in the displayed timetable.
export function filterEventsForSemester<T extends ClassEventWithWeekRecord>(
  events: T[],
  semester: SemesterRecord,
  weeks: SemesterWeekRecord[] = [],
): T[]
{
  const academicYear = semester.academicYear.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  const nameYear = semester.semesterName.match(/\b(\d{4})$/)?.[1];
  const year = nameYear ?? academicYear?.[semester.semesterNo === 1 ? 1 : 2];
  const startMonth = semester.semesterNo === 1 ? "07" : semester.semesterNo === 2 ? "01" : "05";
  const startDate = year ? `${year}-${startMonth}-01` : null;
  const endDate = year
    ? semester.semesterNo === 1 ? `${Number(year) + 1}-01-01`
      : `${year}-${semester.semesterNo === 2 ? "07" : "08"}-01`
    : null;

  return events.filter((event) => {
    if (event.semesterId !== semester.semesterId) return false;
    // Keep calendar-defined sessions, including a week zero that precedes the
    // nominal semester start. Match the date rather than trusting a week ID.
    if (weeks.some((week) => (
      week.semesterId === semester.semesterId
      && event.eventDate >= week.startDate && event.eventDate <= week.endDate
    ))) return true;
    return !startDate || !endDate || (event.eventDate >= startDate && event.eventDate < endDate);
  });
}

export function filterClassesForSemester<T extends CourseClassRecord>(
  classes: T[],
  semester: SemesterRecord,
  weeks: SemesterWeekRecord[] = [],
): T[]
{
  return classes.filter((group) => group.semesterId === semester.semesterId)
    .map((group) => {
      const originId = "identifier" in group
        ? (group.identifier as { originSemesterId?: number }).originSemesterId ?? semester.semesterId
        : semester.semesterId;
      return { ...group, events: filterEventsForSemester(group.events, semester, weeks)
        .filter(event => (event.startSemesterId ?? event.semesterId) === originId) };
    });
}

export function filterTimetableForSemester(
  data: TimetableData,
  semester: SemesterRecord,
  weeks: SemesterWeekRecord[],
): TimetableData
{
  const events = filterEventsForSemester(data.events, semester, weeks)
    .filter(event => (event.startSemesterId ?? event.semesterId) === (event.originSemesterId ?? semester.semesterId));
  return {
    ...data,
    semester,
    semesterWeeks: weeks,
    selections: filterClassesForSemester(data.selections, semester, weeks),
    events,
    clashes: detectTimetableClashes(events),
  };
}
