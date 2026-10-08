import { describe, expect, it, vi } from "vitest";
import { annotateEventCohort } from "./schedule-cohorts";
import type { ClassEventWithWeekRecord, SemesterRecord } from "./types";

// Exercise published data without loading scraper code or production schedules.
vi.mock("@/data/schedule-cohorts.json", () => ({
  default: {
    formatVersion: 1,
    sources: ["january.pdf"],
    eventStarts: {
      "NIE301|daytime|TG|TG16|CLASS|2026-09-12|15:30:00|18:30:00": "2025/2026#2",
      "NIE301|evening|CRN|CRN01|CLASS|2026-09-12|19:00:00|22:00:00": "2025/2026#2",
      "CDO303SU|evening|CRN|CRN02|CLASS|2026-12-21|19:00:00|22:00:00": "2026/2027#2",
    },
  },
}));

const semesters: SemesterRecord[] = [
  { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026" },
  { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026" },
  { semesterId: 4, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027" },
];
const completion: ClassEventWithWeekRecord = {
  eventId: 9001, classId: 901, semesterId: 3, courseCode: "NIE301",
  scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG16", eventKind: "CLASS",
  eventDate: "2026-09-12", dayOfWeek: 6, startTime: "15:30:00", endTime: "18:30:00",
  eventMode: "On campus", campus: null, remarks: null,
  weekId: null, weekNo: null, weekType: null, weekLabel: null,
};

describe("published cohort ownership", () => {
  it("uses the recorded January TG16 origin independently of database IDs", () => {
    expect(annotateEventCohort(completion, semesters).startSemesterId).toBe(1);
    expect(annotateEventCohort({ ...completion, eventId: 10, classId: 20 }, semesters).startSemesterId).toBe(1);
    expect(annotateEventCohort({ ...completion, eventDate: "2026-08-14", startTime: "12:00:00", endTime: "15:00:00" }, semesters).startSemesterId).toBe(3);
  });

  it("keeps evening CRN ownership separate and fails closed for unknown origins", () => {
    expect(annotateEventCohort({ ...completion, scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01",
      startTime: "19:00:00", endTime: "22:00:00" }, semesters).startSemesterId).toBe(1);
    expect(annotateEventCohort(completion, [semesters[1]]).startSemesterId).toBe(0);
  });

  it("applies published intake ownership to pre-term courses", () => {
    const preTerm = { ...completion, courseCode: "CDO303SU", scheduleType: "evening" as const,
      groupCodeType: "CRN" as const, groupCode: "CRN02", eventDate: "2026-12-21",
      startTime: "19:00:00", endTime: "22:00:00" };
    expect(annotateEventCohort(preTerm, semesters).startSemesterId).toBe(4);
  });

  it("preserves snapshot ownership for an event with no published mapping", () => {
    const event = { ...completion, courseCode: "ACC201", startSemesterId: 4 };
    expect(annotateEventCohort(event, semesters).startSemesterId).toBe(4);
    expect(completion.startSemesterId).toBeUndefined();
  });
});
