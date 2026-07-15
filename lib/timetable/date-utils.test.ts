import { describe, expect, it } from "vitest";

import {
  getCurrentSemesterContext,
  getSingaporeDateString,
} from "./date-utils";
import type { SemesterRecord, SemesterWeekRecord } from "./types";

const SEMESTER: SemesterRecord = {
  semesterId: 1,
  academicYear: "2026/2027",
  semesterNo: 1,
  semesterName: "July 2026",
};

const SEMESTER_WEEKS: SemesterWeekRecord[] = [
  {
    weekId: 1,
    semesterId: SEMESTER.semesterId,
    weekNo: 1,
    weekType: "TEACHING",
    label: "Week 1",
    startDate: "2026-07-15",
    endDate: "2026-07-21",
  },
];

describe("Singapore calendar dates", () => {
  it("formats early Singapore hours as the Singapore calendar day", () => {
    expect(getSingaporeDateString(new Date("2026-07-14T16:30:00.000Z"))).toBe("2026-07-15");
  });

  it("uses Singapore calendar dates for current semester context", () => {
    const context = getCurrentSemesterContext(
      [SEMESTER],
      SEMESTER_WEEKS,
      new Date("2026-07-14T16:30:00.000Z"),
    );

    expect(context).toEqual({
      semester: SEMESTER,
      week: SEMESTER_WEEKS[0],
      isVacation: false,
    });
  });
});
