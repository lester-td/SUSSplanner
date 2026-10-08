import { describe, expect, it } from "vitest";
import { getPdfClassSessionEvents } from "./class-sessions";
import type { TimetableData, TimetableEventRecord } from "@/lib/timetable/types";

const event: TimetableEventRecord = {
  eventId: 1, classId: 1, courseCode: "NIE351", courseName: "Learning", schoolName: null,
  shareKey: "NIE351:evening:CRN:CRN06", semesterId: 20, startSemesterId: 20,
  scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN06",
  eventKind: "CLASS", eventDate: "2027-05-14", dayOfWeek: 5, startTime: "19:00", endTime: "22:00",
  eventMode: "FACE-TO-FACE", campus: "CLE", remarks: null, weekId: null, weekNo: null,
  weekType: null, weekLabel: null,
};
const data: TimetableData = {
  semester: null, semesterWeeks: [], selections: [], clashes: [], unresolvedSelections: [], events: [event],
  classSessionEvents: [event, { ...event, eventId: 2, eventDate: "2027-08-21", semesterId: 21 },
    { ...event, eventId: 3, eventKind: "EXAM", eventDate: "2027-06-16" }],
};

describe("PDF class-session listing", () => {
  it("includes spillovers while keeping exams in the existing exam view", () => {
    expect(getPdfClassSessionEvents(data).map(event => event.eventDate)).toEqual(["2027-05-14", "2027-08-21"]);
    expect(data.events).toHaveLength(1);
  });

  it("respects hidden courses across all their sessions", () => {
    expect(getPdfClassSessionEvents(data, [event.shareKey])).toEqual([]);
  });

  it("supports older timetable responses without a complete session list", () => {
    const { classSessionEvents: _sessions, ...legacy } = data;
    expect(getPdfClassSessionEvents(legacy)).toEqual([event]);
  });
});
