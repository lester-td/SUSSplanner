import { describe, expect, it } from "vitest";

import {
  formatCampusCodes,
  formatCampusNames,
  formatCampusSummary,
  getClassCampusCodes,
  getEventCampusCodes,
} from "./campus";
import { buildSelectedCourseCards, buildTimetableBlocks } from "./timetable-utils";
import { buildExportCourses } from "@/lib/export/timetable-model";
import type { TimetableData, TimetableEventRecord } from "./types";

const event: TimetableEventRecord = {
  eventId: 1, classId: 1, eventKind: "CLASS", eventDate: "2026-10-05", dayOfWeek: 1,
  startTime: "19:00:00", endTime: "22:00:00", eventMode: "FACE-TO-FACE", campus: "CLE",
  remarks: null, courseCode: "ICT235", courseName: "Software Design", schoolName: null,
  semesterId: 1, scheduleType: "evening", groupCodeType: "CRN", groupCode: "01",
  weekId: 1, weekNo: 1, weekType: "TEACHING", weekLabel: "Week 1", shareKey: "ICT235-01",
};
const onlineEvent: TimetableEventRecord = {
  ...event, eventId: 2, eventDate: "2026-10-12", weekId: 2, weekNo: 2, weekLabel: "Week 2",
  eventMode: "ONLINE", campus: "ONL",
};

describe("campus labels", () => {
  it.each([
    ["ONL", "Online"], ["CLE", "Clementi"], ["NP", "Ngee Ann Poly"], ["NYP", "Nanyang Poly"],
  ])("expands %s to %s", (code, name) => {
    expect(formatCampusNames([code])).toBe(name);
    expect(formatCampusSummary([code])).toBe(name);
  });

  it("normalizes, deduplicates and orders codes consistently", () => {
    expect(formatCampusCodes(["nyp", "CLE / onl", "NP", "Clementi", " "])).toBe("ONL/CLE/NP/NYP");
    expect(formatCampusSummary(["CLE", "Clementi"])).toBe("Clementi");
    expect(formatCampusSummary(["ONL", "CLE"])).toBe("Mixed");
  });

  it("preserves unconfirmed campus codes", () => {
    expect(formatCampusNames(["AMK"])).toBe("AMK");
    expect(formatCampusNames(["EXT"])).toBe("EXT");
  });

  it("uses only explicitly specified campuses, including for online delivery", () => {
    expect(getEventCampusCodes({ campus: "NP", eventMode: "ONLINE" })).toEqual(["NP"]);
    expect(getEventCampusCodes({ campus: null, eventMode: "ONLINE" })).toEqual([]);
    expect(getEventCampusCodes({ campus: " ", eventMode: "VIRTUAL LABORATORY" })).toEqual([]);
    expect(getEventCampusCodes({ campus: null, eventMode: "FACE-TO-FACE" })).toEqual([]);
    expect(formatCampusSummary([])).toBe("");
    expect(formatCampusCodes([])).toBe("");
    expect(formatCampusNames([])).toBe("");
  });

  it("ignores exams and other events in a course's campus summary", () => {
    expect(getClassCampusCodes([
      onlineEvent, { ...event, eventKind: "EXAM" }, { ...event, eventKind: "OTHER", campus: "NP" },
    ])).toEqual(["ONL"]);
  });
});

describe("campuses across timetable weeks", () => {
  it("leaves older schedules without a campus unlabeled in every week", () => {
    const legacyEvents = [event, onlineEvent].map(event => ({ ...event, campus: null }));
    expect(getClassCampusCodes(legacyEvents)).toEqual([]);
    for (const selectedWeekId of ["all", 1, 2] as const)
    {
      expect(buildTimetableBlocks(legacyEvents, selectedWeekId).every(block => block.campus === null)).toBe(true);
    }
  });
  it("combines a class at the same time into one all-weeks block", () => {
    const blocks = buildTimetableBlocks([event, onlineEvent], "all");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ campus: "ONL/CLE", weekLabel: "1-2", occurrenceCount: 2, eventIds: [1, 2] });
    expect(buildTimetableBlocks([onlineEvent, event], "all")[0].campus).toBe("ONL/CLE");
  });

  it("shows only the selected week's campus", () => {
    expect(buildTimetableBlocks([event, onlineEvent], 1)[0].campus).toBe("CLE");
    expect(buildTimetableBlocks([event, onlineEvent], 2)[0].campus).toBe("ONL");
  });

  it("keeps different times and class groups separate", () => {
    const blocks = buildTimetableBlocks([
      event, onlineEvent, { ...event, eventId: 3, startTime: "18:00:00" },
      { ...event, eventId: 4, groupCode: "02", shareKey: "ICT235-02" },
    ], "all");
    expect(blocks).toHaveLength(3);
  });

  it("carries class campuses through course cards and exports", () => {
    const identifier = { courseCode: event.courseCode, scheduleType: event.scheduleType, groupCodeType: event.groupCodeType, groupCode: event.groupCode };
    const data: TimetableData = {
      semester: null, semesterWeeks: [], events: [event, onlineEvent], clashes: [], unresolvedSelections: [],
      selections: [{
        classId: 1, semesterId: 1, ...identifier, courseName: event.courseName, schoolName: null,
        creditUnits: 5, presentationPattern: null, availableAsGsp: false, isRestricted: false, remarks: null,
        identifier, shareKey: event.shareKey, events: [event, onlineEvent, { ...event, eventKind: "EXAM", campus: "NP" }],
        hasEca: false, examAssessmentMode: null,
      }],
    };
    const cards = buildSelectedCourseCards(data);
    expect(cards[0].campuses).toEqual(["ONL", "CLE"]);
    expect(buildExportCourses(cards, new Map())[0].campuses).toEqual(["ONL", "CLE"]);
  });
});
