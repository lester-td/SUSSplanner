import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { decodeSemesterPlannerShareUrl, encodeSemesterPlannerShareUrl } from "./share-url";
import type { SemesterPlannerState } from "./types";

function encodedPayload(payload: unknown)
{
  return deflateSync(Buffer.from(JSON.stringify(payload))).toString("base64url");
}

function contents(state: SemesterPlannerState)
{
  return { ...state, courses: state.courses.map(({ id: _id, ...course }) => course) };
}

const sample: SemesterPlannerState = {
  totalCreditsGoal: 132.5,
  numSemesters: 8,
  courses: [
    { id: "catalog:NIE301", courseCode: "NIE301", courseName: "Learning with Communities", schoolName: "UNIVERSITY CORE", creditUnits: 5, semesterSpan: 2, assignedSemester: 2, source: "catalog" },
    { id: "manual:custom", courseCode: "CUSTOM", courseName: "语言, Art & Design — a custom course 🎨", schoolName: null, creditUnits: 2.5, semesterSpan: 1, assignedSemester: null, source: "manual" },
  ],
};

describe("semester planner snapshot links", () => {
  it("preserves names, credit fractions, semester spans, bank courses and custom sources", async () => {
    const path = await encodeSemesterPlannerShareUrl(sample);
    expect(path).toMatch(/^\/planner#plan=[A-Za-z0-9_-]+$/);
    const decoded = await decodeSemesterPlannerShareUrl(path.split("#plan=")[1]);
    expect(contents(decoded)).toEqual(contents(sample));
    expect(new Set(decoded.courses.map((course) => course.id)).size).toBe(2);
  });

  it("keeps a 40-course snapshot compact and independent of later edits", async () => {
    const state: SemesterPlannerState = {
      totalCreditsGoal: 200,
      numSemesters: 8,
      courses: Array.from({ length: 40 }, (_, index) => ({
        id: `course:${index}`, courseCode: `ICT${100 + index}`, courseName: `Course ${index}: Computing, Networks and Information Systems`,
        schoolName: "SCHOOL OF SCIENCE & TECHNOLOGY", creditUnits: 5, semesterSpan: 1, assignedSemester: Math.floor(index / 5), source: "catalog",
      })),
    };
    const path = await encodeSemesterPlannerShareUrl(state);
    expect(path.length).toBeLessThan(2_000);
    state.courses[0].courseName = "Edited after sharing";
    state.courses[0].assignedSemester = null;
    const decoded = await decodeSemesterPlannerShareUrl(path.split("#plan=")[1]);
    expect(decoded.courses).toHaveLength(40);
    expect(decoded.courses[0].courseName).toContain("Course 0:");
    expect(decoded.courses[0].assignedSemester).toBe(0);
    expect(decoded.courses[39].assignedSemester).toBe(7);
  });

  it("shares an empty plan, including a zero credit target", async () => {
    const state = { totalCreditsGoal: 0, numSemesters: 1, courses: [] };
    const path = await encodeSemesterPlannerShareUrl(state);
    expect(await decodeSemesterPlannerShareUrl(path.split("#plan=")[1])).toEqual(state);
  });

  it.each(["", "a", "invalid!", "A".repeat(32_769)])("rejects invalid or oversized encoded input", async (value) => {
    await expect(decodeSemesterPlannerShareUrl(value)).rejects.toThrow();
  });

  it.each([
    { v: 2, g: 130, s: 8, c: [] },
    { v: 1, g: -1, s: 8, c: [] },
    { v: 1, g: 130, s: 0, c: [] },
    { v: 1, g: 130, s: 8, c: [["ICT101", "Computing", 5, 1, 0, 2]] },
    { v: 1, g: 130, s: 8, c: [["NIE301", "Communities", 5, 2, 7, 0]] },
    { v: 1, g: 130, s: 8, c: [["ICT101", "Computing", 5, 1, 8, 0]] },
    { v: 1, g: 130, s: 1, c: [["CUSTOM", "Long course", 5, 2, null, 1]] },
    { v: 1, g: 130, s: 8, c: Array.from({ length: 301 }, () => ["ICT101", "Computing", 5, 1, 0, 0]) },
  ])("rejects unsupported versions and invalid plan contents", async (payload) => {
    await expect(decodeSemesterPlannerShareUrl(encodedPayload(payload))).rejects.toThrow();
  });

  it("bounds decompression before parsing a highly compressed oversized payload", async () => {
    await expect(decodeSemesterPlannerShareUrl(encodedPayload({ oversized: "a".repeat(256_001) }))).rejects.toThrow(/too large/);
  });

  it("rejects a damaged compressed snapshot", async () => {
    const path = await encodeSemesterPlannerShareUrl(sample);
    const encoded = path.split("#plan=")[1];
    await expect(decodeSemesterPlannerShareUrl(encoded.slice(0, -8))).rejects.toThrow();
  });
});
