import { filterEventsForSemester, getSemesterDateRange } from "../timetable/semester-events";
import type { CourseClassRecord, SemesterRecord, SemesterWeekRecord } from "../timetable/types";

// Archived offerings stay in the database. Publish only active terms, including
// dated completion sessions needed by an existing active-term selection.
export function getPublishedScheduleClasses(
  classes: CourseClassRecord[],
  semesters: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>,
): CourseClassRecord[]
{
  const visible = semesters.filter(semester => !semester.isArchived);
  const origins = new Map(semesters.map(semester => [semester.semesterId, semester]));
  const published = new Map<string, CourseClassRecord>();
  for (const group of classes)
  {
    for (const semester of visible)
    {
      const { startDate } = getSemesterDateRange(semester);
      const nextStartDate = semesters.filter(item => item.academicYear > semester.academicYear
        || (item.academicYear === semester.academicYear && item.semesterNo > semester.semesterNo))
        .map(item => getSemesterDateRange(item).startDate).filter((date): date is string => Boolean(date)).sort()[0];
      const scoped = group.events.filter(event => {
        const owner = origins.get(event.startSemesterId ?? group.semesterId);
        if (!owner || owner.semesterId === semester.semesterId) return true;
        const followsOwner = semester.academicYear > owner.academicYear
          || (semester.academicYear === owner.academicYear && semester.semesterNo > owner.semesterNo);
        // January and May calendars overlap. Sessions inside the owner's date
        // range stay there rather than creating a second continuation slice.
        const { endDate } = getSemesterDateRange(owner);
        return followsOwner && (!endDate || event.eventDate >= endDate)
          && (!nextStartDate || event.eventDate < nextStartDate);
      }).map(event => {
        const week = semester.weeks.find(item => event.eventDate >= item.startDate && event.eventDate <= item.endDate);
        return {
          ...event, semesterId: semester.semesterId,
          startSemesterId: event.startSemesterId ?? group.semesterId,
          isPreTerm: (event.startSemesterId ?? group.semesterId) === semester.semesterId
            && Boolean(startDate && event.eventDate < startDate),
          weekId: week?.weekId ?? null, weekNo: week?.weekNo ?? null,
          weekType: week?.weekType ?? null, weekLabel: week?.label ?? null,
        };
      });
      const events = filterEventsForSemester(scoped, semester, semester.weeks)
        .filter(event => group.semesterId === semester.semesterId || event.startSemesterId !== semester.semesterId);
      if (events.length === 0 && (group.events.length > 0 || group.semesterId !== semester.semesterId)) continue;
      const key = [semester.semesterId, group.courseCode, group.scheduleType, group.groupCodeType, group.groupCode].join(":");
      const existing = published.get(key);
      // Prefer the target term's class metadata when a continuation shares its TG.
      const metadata = !existing || group.semesterId === semester.semesterId ? group : existing;
      const merged = new Map([...(existing?.events ?? []), ...events].map(event => [event.eventId, event]));
      published.set(key, { ...metadata, semesterId: semester.semesterId, events: [...merged.values()].sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.startTime.localeCompare(right.startTime) || left.eventId - right.eventId) });
    }
  }
  const result = [...published.values()];
  const continuationTargets = new Map<string, Set<number>>();
  const ownerKey = (group: CourseClassRecord, ownerId: number) => [ownerId, group.courseCode, group.scheduleType, group.groupCodeType, group.groupCode].join(":");
  for (const group of result) {
    for (const event of group.events) {
      const ownerId = event.startSemesterId ?? group.semesterId;
      if (ownerId === group.semesterId) continue;
      const key = ownerKey(group, ownerId);
      const targets = continuationTargets.get(key) ?? new Set<number>();
      targets.add(group.semesterId);
      continuationTargets.set(key, targets);
    }
  }
  return result.map(group => ({ ...group,
    continuationSemesterIds: [...(continuationTargets.get(ownerKey(group, group.semesterId)) ?? [])],
  }));
}
