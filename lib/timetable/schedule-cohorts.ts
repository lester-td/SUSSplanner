import index from "@/data/schedule-cohorts.json";
import type { ClassEventWithWeekRecord, SemesterRecord } from "./types";

function eventKey(event: ClassEventWithWeekRecord)
{
  return [event.courseCode, event.scheduleType, event.groupCodeType, event.groupCode,
    event.eventKind, event.eventDate, event.startTime, event.endTime].join("|");
}

export function annotateEventCohort<T extends ClassEventWithWeekRecord>(event: T, semesters: SemesterRecord[]): T
{
  const owner = (index.eventStarts as Record<string, string>)[eventKey(event)];
  if (!owner) return { ...event, startSemesterId: event.startSemesterId ?? event.semesterId };
  const [academicYear, semesterNo] = owner.split("#");
  const semester = semesters.find(item => item.academicYear === academicYear && item.semesterNo === Number(semesterNo));
  // An unknown source cohort must not become a new start in the event's term.
  return { ...event, startSemesterId: semester?.semesterId ?? 0 };
}
