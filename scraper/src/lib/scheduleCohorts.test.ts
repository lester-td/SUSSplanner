import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScheduleCohortIndex } from "./scheduleCohorts.js";
import type { ClassEventRecord, ScheduleParseResult } from "./types.js";

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
    assert.deepEqual(index.eventStarts, {
      "NIE301|daytime|TG|TG16|CLASS|2026-09-12|15:30:00|18:30:00": "2025/2026#2",
    });
  });

  it("rejects an event assigned to two different source cohorts", () => {
    assert.throws(() => buildScheduleCohortIndex([
      source("january.pdf", [sourceEvent("2026-01-08"), sourceEvent("2026-09-12", { academicYear: "2025/2026", semesterNo: 2 })]),
      source("july.pdf", [sourceEvent("2026-08-14"), sourceEvent("2026-09-12")]),
    ]), /Conflicting schedule cohorts/);
  });

  it("records explicit intake ownership for pre-term courses without a multi-semester code heuristic", () => {
    const preTerm = sourceEvent("2026-12-21", { courseCode: "CDO303SU", academicYear: "2026/2027", semesterNo: 2 });
    const index = buildScheduleCohortIndex([source("january-2027.pdf", [preTerm])]);
    assert.deepEqual(Object.values(index.eventStarts), ["2026/2027#2"]);
  });

  it("retains older mappings when adding a new source and replaces stale mappings for reimported events", () => {
    const event = sourceEvent("2026-01-08");
    const key = "NIE301|daytime|TG|TG16|CLASS|2026-01-08|15:30:00|18:30:00";
    const previous = { formatVersion: 1 as const, sources: ["older.pdf"], eventStarts: { untouched: "2024/2025#2", [key]: "2024/2025#2" } };
    const index = buildScheduleCohortIndex([source("january.pdf", [event])], previous);
    assert.deepEqual(index.sources, ["january.pdf", "older.pdf"]);
    assert.deepEqual(index.eventStarts, { untouched: "2024/2025#2" });
  });
});
