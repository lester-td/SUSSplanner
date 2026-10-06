import { inferSemesterFromIsoDate } from "./dates.js";
import type { ClassEventRecord, ScheduleParseResult } from "./types.js";

export type ScheduleCohortIndex = {
  formatVersion: 1;
  sources: string[];
  eventStarts: Record<string, string>;
};

function isMultiSemesterCourse(code: string): boolean {
  return code === "NIE301" || code === "NIE351" || code.endsWith("499");
}

function eventKey(event: ClassEventRecord): string {
  return [event.courseCode, event.scheduleType, event.groupCodeType, event.groupCode,
    event.eventKind, event.eventDate, event.startTime, event.endTime].join("|");
}

// Keep each document separate until its cohort has been identified. Group
// numbers are reused by later intakes and cannot establish event ownership.
export function buildScheduleCohortIndex(sources: Array<{ source: string; result: ScheduleParseResult }>): ScheduleCohortIndex {
  const owners = new Map<string, string>();
  const crossSemesterKeys = new Set<string>();
  for (const { result } of sources) {
    const grouped = new Map<string, ClassEventRecord[]>();
    for (const event of result.classEvents.filter(event => isMultiSemesterCourse(event.courseCode))) {
      const key = [event.courseCode, event.scheduleType, event.groupCodeType, event.groupCode].join("|");
      const events = grouped.get(key) ?? [];
      events.push(event);
      grouped.set(key, events);
    }
    for (const events of grouped.values()) {
      const firstDate = events.map(event => event.eventDate).sort()[0];
      const semester = inferSemesterFromIsoDate(firstDate);
      const owner = `${semester.academicYear}#${semester.semesterNo}`;
      for (const event of events) {
        const key = eventKey(event);
        const existing = owners.get(key);
        if (existing && existing !== owner) throw new Error(`Conflicting schedule cohorts for ${key}: ${existing} / ${owner}`);
        owners.set(key, owner);
        if (event.academicYear !== semester.academicYear || event.semesterNo !== semester.semesterNo) crossSemesterKeys.add(key);
      }
    }
  }
  return {
    formatVersion: 1,
    sources: sources.map(item => item.source).sort(),
    eventStarts: Object.fromEntries([...crossSemesterKeys].sort().map(key => [key, owners.get(key)!])),
  };
}
