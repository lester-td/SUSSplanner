import { describe, expect, it } from "vitest";
import { buildScheduleCohortIndex } from "../../scraper/src/lib/scheduleCohorts";
import type { ClassEventRecord, ScheduleParseResult } from "../../scraper/src/lib/types";
import { annotateEventCohort } from "./schedule-cohorts";
import type { ClassEventWithWeekRecord, SemesterRecord } from "./types";

const semesters: SemesterRecord[] = [
  { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026" },
  { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026" },
];
const completion: ClassEventWithWeekRecord = {
  eventId: 9001, classId: 901, semesterId: 3, courseCode: "NIE301",
  scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG16", eventKind: "CLASS",
  eventDate: "2026-09-12", dayOfWeek: 6, startTime: "15:30:00", endTime: "18:30:00",
  eventMode: "On campus", campus: null, remarks: null,
  weekId: null, weekNo: null, weekType: null, weekLabel: null,
};
function sourceEvent(eventDate: string, overrides: Partial<ClassEventRecord> = {}): ClassEventRecord
{
  return { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG16",
    eventKind: "CLASS", eventDate, startTime: "15:30:00", endTime: "18:30:00",
    academicYear: eventDate < "2026-07-01" ? "2025/2026" : "2026/2027",
    semesterNo: eventDate < "2026-07-01" ? 2 : 1, ...overrides };
}
function source(source: string, classEvents: ClassEventRecord[])
{
  const result: ScheduleParseResult = { semesters: [], courses: [], classes: [], classEvents, warnings: [] };
  return { source, result };
}

describe("source cohort ownership", () => {
  it("preserves document ownership when later intakes reuse the same TG", () => {
    const index = buildScheduleCohortIndex([
      source("january.pdf", [sourceEvent("2026-01-08"), sourceEvent("2026-09-12", { academicYear: "2025/2026", semesterNo: 2 })]),
      source("july.pdf", [sourceEvent("2026-08-14", { startTime: "12:00:00", endTime: "15:00:00" })]),
    ]);
    expect(index.eventStarts).toEqual({
      "NIE301|daytime|TG|TG16|CLASS|2026-09-12|15:30:00|18:30:00": "2025/2026#2",
    });
  });

  it("rejects an event assigned to two different source cohorts", () => {
    expect(() => buildScheduleCohortIndex([
      source("january.pdf", [sourceEvent("2026-01-08"), sourceEvent("2026-09-12", { academicYear: "2025/2026", semesterNo: 2 })]),
      source("july.pdf", [sourceEvent("2026-08-14"), sourceEvent("2026-09-12")]),
    ])).toThrow("Conflicting schedule cohorts");
  });

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
});


it("records explicit intake ownership for pre-term courses without a multi-semester code heuristic", () => {
  const preTerm = sourceEvent("2026-12-21", { courseCode: "CDO303SU", academicYear: "2026/2027", semesterNo: 2 });
  const index = buildScheduleCohortIndex([source("january-2027.pdf", [preTerm])]);
  expect(Object.values(index.eventStarts)).toEqual(["2026/2027#2"]);
});

it("retains older mappings when adding a new source and replaces stale mappings for reimported events", () => {
  const event = sourceEvent("2026-01-08");
  const key = "NIE301|daytime|TG|TG16|CLASS|2026-01-08|15:30:00|18:30:00";
  const previous = { formatVersion: 1 as const, sources: ["older.pdf"], eventStarts: { untouched: "2024/2025#2", [key]: "2024/2025#2" } };
  const index = buildScheduleCohortIndex([source("january.pdf", [event])], previous);
  expect(index.sources).toEqual(["january.pdf", "older.pdf"]);
  expect(index.eventStarts).toEqual({ untouched: "2024/2025#2" });
});
