import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimetableAlerts } from "@/components/timetable/timetable-alerts";
import type { SemesterRecord, TimetableEventRecord } from "./types";

const july: SemesterRecord = {
  semesterId: 4, academicYear: "2027/2028", semesterNo: 1,
  semesterName: "July 2027", hasIntakeSchedule: false,
};
const weekZero: TimetableEventRecord = {
  eventId: 1, classId: 10, semesterId: 4, courseCode: "NIE351",
  courseName: "Learning", schoolName: null, shareKey: "NIE351:evening:CRN:CRN01",
  scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01",
  eventKind: "CLASS", eventDate: "2027-08-06", dayOfWeek: 5,
  startTime: "19:00:00", endTime: "22:00:00", eventMode: null, campus: "CLE",
  remarks: null, weekId: 40, weekNo: 0, weekType: "TEACHING", weekLabel: "Week 0",
};

describe("timetable info section", () => {
  it("shows the unavailable intake notice and the existing dismiss control with no selected classes", () => {
    const html = renderToStaticMarkup(createElement(TimetableAlerts, { semester: july, events: [], clashes: [] }));
    expect(html).toContain("timetable-alerts-card");
    expect(html).toContain("Intake schedule unavailable");
    expect(html).toContain("July 2027 intake schedules are not yet available.");
    expect(html).toContain("Dismiss");
  });

  it("keeps Week 0 and Study Week details alongside the intake notice", () => {
    const studyWeek: TimetableEventRecord = {
      ...weekZero, eventId: 2, eventDate: "2027-11-02", weekId: 413,
      weekNo: 13, weekType: "STUDY", weekLabel: "Study Week",
    };
    const html = renderToStaticMarkup(createElement(TimetableAlerts, {
      semester: july, events: [weekZero, studyWeek], clashes: [],
    }));
    expect(html).toContain("July 2027 intake schedules are not yet available.");
    expect(html).toContain("1 class in Week 0");
    expect(html).toContain("1 class in Study Week");
    expect(html.match(/>Dismiss</g)).toHaveLength(1);
  });

  it("removes the notice when intake availability is enabled while preserving exceptional class alerts", () => {
    const available = { ...july, hasIntakeSchedule: true };
    expect(renderToStaticMarkup(createElement(TimetableAlerts, {
      semester: available, events: [], clashes: [],
    }))).toBe("");
    const html = renderToStaticMarkup(createElement(TimetableAlerts, {
      semester: available, events: [weekZero], clashes: [],
    }));
    expect(html).not.toContain("Intake schedule unavailable");
    expect(html).toContain("1 class in Week 0");
  });
});
