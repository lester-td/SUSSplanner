import { describe, expect, it } from "vitest";

import { getExamAssessmentMode, UNDATED_EXAM_GUIDANCE } from "./exam-status";
import { buildSelectedCourseCards } from "./timetable-utils";
import type { AssessmentComponentRecord, TimetableData, TimetableEventRecord, TimetableSelectionRecord } from "./types";

function assessment(assessmentMode: string): AssessmentComponentRecord
{
  return {
    componentId: 1, courseCode: "ICT235", scheduleType: "evening",
    componentName: assessmentMode, componentGroup: "OES", assessmentMode,
    weightPercentage: 50, sortOrder: 1,
  };
}

const datedExam: TimetableEventRecord = {
  eventId: 1, classId: 1, eventKind: "EXAM", eventDate: "2026-11-18", dayOfWeek: 3,
  startTime: "10:00:00", endTime: "12:00:00", eventMode: "PROCTORED ONLINE EXAM", venue: null, remarks: null,
  courseCode: "ICT235", semesterId: 3, scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01",
  weekId: null, weekNo: null, weekType: null, weekLabel: null,
  courseName: "Software Design", schoolName: null, shareKey: "ICT235-evening-CRN-CRN01",
};

function timetable(examAssessmentMode: TimetableSelectionRecord["examAssessmentMode"], events: TimetableEventRecord[] = []): TimetableData
{
  const selection: TimetableSelectionRecord = {
    classId: 1, courseCode: "ICT235", semesterId: 3, scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01",
    availableAsGsp: null, isRestricted: null, remarks: null, courseName: "Software Design", schoolName: null,
    creditUnits: 5, presentationPattern: null, events,
    identifier: { courseCode: "ICT235", scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01" },
    shareKey: "ICT235-evening-CRN-CRN01", hasEca: false, examAssessmentMode,
  };
  return { semester: null, semesterWeeks: [], selections: [selection], events, clashes: [], unresolvedSelections: [] };
}

describe("exam status", () => {
  it("recognizes assessment exam modes without a scheduled event", () => {
    expect(getExamAssessmentMode([assessment("Proctored Online Exam")])).toBe("Proctored Online Exam");
    expect(getExamAssessmentMode([assessment("Online Exam")])).toBe("Online Exam");
    expect(getExamAssessmentMode([assessment("Written Exam")])).toBe("Written Exam");
    expect(getExamAssessmentMode([assessment("ECA")])).toBeNull();
  });

  it("shows an undated exam status and guidance instead of No Exam", () => {
    const [proctored] = buildSelectedCourseCards(timetable("Proctored Online Exam"));
    const [online] = buildSelectedCourseCards(timetable("Online Exam"));
    const [written] = buildSelectedCourseCards(timetable("Written Exam"));
    expect(proctored.examStatus).toBe("undated");
    expect(proctored.examDateLabel).toBe("Proctored Online Exam");
    expect(proctored.examGuidance).toBe(UNDATED_EXAM_GUIDANCE);
    expect(online.examDateLabel).toBe("Online Exam");
    expect(written.examDateLabel).toBe("Has an Exam");
  });

  it("uses the selected group's scheduled date when present", () => {
    const [course] = buildSelectedCourseCards(timetable("Proctored Online Exam", [datedExam]));
    expect(course.examStatus).toBe("dated");
    expect(course.examDateLabel).toContain("18 Nov 2026");
    expect(course.examTimeLabel).toBe("10:00");
    expect(course.examGuidance).toBeNull();
  });
});
