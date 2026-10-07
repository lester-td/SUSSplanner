import { describe, expect, it } from "vitest";
import { filterEventsForSemester } from "./semester-events";
import type { ClassEventWithWeekRecord, SemesterRecord, SemesterWeekRecord } from "./types";

const january: SemesterRecord = { semesterId: 1, semesterName: "January 2026", academicYear: "2025/2026", semesterNo: 2 };
const july: SemesterRecord = { semesterId: 3, semesterName: "July 2026", academicYear: "2026/2027", semesterNo: 1 };
function event(semesterId: number, eventDate: string): ClassEventWithWeekRecord
{
  return {
    semesterId, eventDate, courseCode: "NIE301", classId: 1, eventId: 1,
    scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG15",
    eventKind: "CLASS", dayOfWeek: 1, startTime: "09:00", endTime: "12:00",
    eventMode: null, campus: null, remarks: null,
    weekId: null, weekNo: null, weekType: null, weekLabel: null,
  };
}

describe("semester event filtering", () => {
  it("keeps undated-week sessions and exams from the correct half of the year", () => {
    const entries = [event(1, "2026-01-05"), { ...event(1, "2026-05-05"), eventKind: "EXAM" as const }, event(1, "2026-08-05")];
    expect(filterEventsForSemester(entries, january)).toEqual(entries.slice(0, 2));
  });

  it("excludes both preceding and subsequent January sessions from July", () => {
    const entries = [event(3, "2026-01-05"), event(3, "2026-08-05"), event(3, "2027-01-05")];
    expect(filterEventsForSemester(entries, july)).toEqual([entries[1]]);
  });

  it("preserves a calendar-defined week zero before the nominal starting date", () => {
    const week: SemesterWeekRecord = {
      weekId: 39, semesterId: 1, weekNo: 0, weekType: "TEACHING", label: "Week 0",
      startDate: "2025-12-29", endDate: "2026-01-04",
    };
    const entry = event(1, "2025-12-30");
    expect(filterEventsForSemester([entry], january, [week])).toEqual([entry]);
  });

  it("does not trust a foreign semester ID or a stale week ID", () => {
    const week: SemesterWeekRecord = {
      weekId: 1, semesterId: 1, weekNo: 1, weekType: "TEACHING", label: "Week 1",
      startDate: "2026-01-12", endDate: "2026-01-18",
    };
    expect(filterEventsForSemester([event(3, "2026-01-13"), { ...event(1, "2026-08-13"), weekId: 1 }], january, [week])).toEqual([]);
  });

  it("keeps explicitly owned pre-term sessions without letting another intake's flag bypass date filtering", () => {
    const owned = { ...event(1, "2025-12-21"), startSemesterId: 1, isPreTerm: true };
    expect(filterEventsForSemester([owned], january)).toEqual([owned]);
    expect(filterEventsForSemester([{ ...owned, startSemesterId: 3 }], january)).toEqual([]);
    expect(filterEventsForSemester([{ ...owned, eventDate: "2026-08-21" }], january)).toEqual([]);
  });
});
