import { describe, expect, it } from "vitest";

import type { PlannerSemesterState, SemesterRecord } from "./types";
import { upsertClassInSavedTimetable } from "./local-storage";
import {
  formatContinuationSemesterShort,
  getCourseContinuationDisplay,
  getFollowingContinuationSemesters,
} from "./course-continuation";

const JANUARY: SemesterRecord = {
  semesterId: 10,
  academicYear: "2025/2026",
  semesterNo: 2,
  semesterName: "January 2026",
};

const MAY: SemesterRecord = {
  semesterId: 11,
  academicYear: "2025/2026",
  semesterNo: 3,
  semesterName: "May 2026",
};

const JULY: SemesterRecord = {
  semesterId: 12,
  academicYear: "2026/2027",
  semesterNo: 1,
  semesterName: "July 2026",
};

const SEMESTERS = [JANUARY, MAY, JULY];

const NEXT_JANUARY: SemesterRecord = {
  semesterId: 14,
  academicYear: "2026/2027",
  semesterNo: 2,
  semesterName: "January 2027",
};

function state(semesterId: number, courseCode: string): PlannerSemesterState
{
  return {
    semesterId,
    selectedClasses: [{
      courseCode,
      scheduleType: "daytime",
      groupCodeType: "TG",
      groupCode: "TG01",
    }],
    hiddenClasses: [],
    courseColorsByCourseCode: {},
    selectedWeekId: "all",
  };
}

describe("course continuation", () => {
  it("chooses the next offered semester for a multi-semester course", () => {
    expect(getFollowingContinuationSemesters({
      courseCode: "NIE301",
      semesterId: JANUARY.semesterId,
      offeredSemesters: [JULY, JANUARY],
      semesters: SEMESTERS,
    })).toEqual([JULY]);
  });

  it("does not infer continuation for a regular repeated offering", () => {
    expect(getFollowingContinuationSemesters({
      courseCode: "ICT133",
      semesterId: JANUARY.semesterId,
      offeredSemesters: [JANUARY, JULY],
      semesters: SEMESTERS,
    })).toEqual([]);
  });

  it("saves and labels a July continuation in January before its calendar weeks are available", () => {
    // Continuation metadata includes terms outside the timetable selector.
    const allSemesters = [...SEMESTERS, NEXT_JANUARY];
    const selection = state(JULY.semesterId, "NIE301").selectedClasses[0];
    const following = getFollowingContinuationSemesters({
      courseCode: selection.courseCode,
      semesterId: JULY.semesterId,
      offeredSemesters: [NEXT_JANUARY, JULY, JANUARY],
      semesters: allSemesters,
    });
    expect(following).toEqual([NEXT_JANUARY]);

    const saved = upsertClassInSavedTimetable(
      null, JULY.semesterId, selection, following.map(semester => semester.semesterId),
    );
    expect(saved.semesterStates?.[String(NEXT_JANUARY.semesterId)].selectedClasses).toEqual([
      { ...selection, originSemesterId: JULY.semesterId },
    ]);
    expect(getCourseContinuationDisplay({
      selection,
      semesterId: JULY.semesterId,
      semesterStates: saved.semesterStates,
      semesters: allSemesters,
    })).toEqual({
      cardLines: ["Continues in January 2027"],
      blockText: "Continues Jan '27",
    });
  });

  it("builds continuation labels only from explicit origin links", () => {
    const semesterStates = {
      [String(JANUARY.semesterId)]: state(JANUARY.semesterId, "NIE301"),
      [String(JULY.semesterId)]: {
        ...state(JULY.semesterId, "NIE301"),
        selectedClasses: [{ ...state(JULY.semesterId, "NIE301").selectedClasses[0], originSemesterId: JANUARY.semesterId }],
      },
    };

    expect(getCourseContinuationDisplay({
      selection: semesterStates[String(JANUARY.semesterId)].selectedClasses[0],
      semesterId: JANUARY.semesterId,
      semesterStates,
      semesters: SEMESTERS,
    })).toEqual({
      cardLines: ["Continues in July 2026"],
      blockText: "Continues Jul '26",
    });

    expect(getCourseContinuationDisplay({
      selection: semesterStates[String(JULY.semesterId)].selectedClasses[0],
      semesterId: JULY.semesterId,
      semesterStates,
      semesters: SEMESTERS,
    })).toEqual({
      cardLines: ["Continued from January 2026"],
      blockText: "",
    });
  });

  it("does not mistake independently added semesters for a continuation", () => {
    const semesterStates = {
      [String(JANUARY.semesterId)]: state(JANUARY.semesterId, "NIE301"),
      [String(JULY.semesterId)]: state(JULY.semesterId, "NIE301"),
    };
    expect(getCourseContinuationDisplay({
      selection: semesterStates[String(JULY.semesterId)].selectedClasses[0],
      semesterId: JULY.semesterId,
      semesterStates,
      semesters: SEMESTERS,
    })).toBeNull();
  });

  it("formats unexpected semester names without changing them", () => {
    expect(formatContinuationSemesterShort("Semester TBC")).toBe("Semester TBC");
  });
});
