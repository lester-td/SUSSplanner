import { describe, expect, it } from "vitest";
import { getActiveSemesters, getIntakeScheduleNotice, getSemesterChoices } from "./semester-visibility";
import type { SemesterRecord } from "./types";

const semesters: SemesterRecord[] = [
  { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: true },
  { semesterId: 2, academicYear: "2025/2026", semesterNo: 3, semesterName: "May 2026" },
  { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026", isArchived: false },
  { semesterId: 4, academicYear: "2027/2028", semesterNo: 1, semesterName: "July 2027", hasIntakeSchedule: false },
];

describe("semester choices", () => {
  it("hides archives by default while accepting older snapshots without an archive flag", () => {
    expect(getSemesterChoices(semesters).map(semester => semester.semesterId)).toEqual([2, 3]);
    expect(semesters).toHaveLength(4);
  });

  it("returns no choices when every semester is archived", () => {
    expect(getSemesterChoices(semesters.map(semester => ({ ...semester, isArchived: true })))).toEqual([]);
  });

  it("keeps unavailable intakes accessible to the timetable but out of offering filters", () => {
    expect(getActiveSemesters(semesters).map(semester => semester.semesterId)).toEqual([2, 3, 4]);
    expect(getSemesterChoices(semesters).map(semester => semester.semesterId)).toEqual([2, 3]);
    expect(getSemesterChoices([{ ...semesters[3], hasIntakeSchedule: true }])).toHaveLength(1);
  });

  it("shows the selected semester's notice until its intake schedule is available", () => {
    expect(getIntakeScheduleNotice(semesters[3])).toBe("July 2027 intake schedules are not yet available. Only continuation sessions from earlier semesters are shown.");
    expect(getIntakeScheduleNotice({ ...semesters[3], hasIntakeSchedule: true })).toBeNull();
    expect(getIntakeScheduleNotice(semesters[2])).toBeNull();
    expect(getIntakeScheduleNotice(null)).toBeNull();
  });
});
