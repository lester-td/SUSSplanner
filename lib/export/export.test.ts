import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import { buildIcs } from "./ics";
import { buildPdfLanes, buildTimetablePdf } from "./pdf";
import type { TimetableEventRecord } from "@/lib/timetable/types";
import { buildTimetableBlocks } from "@/lib/timetable/timetable-utils";

const semester = {
  semesterId: 1,
  academicYear: "2026/2027",
  semesterNo: 1 as const,
  semesterName: "July Semester",
};

const event: TimetableEventRecord = {
  eventId: 1,
  classId: 1,
  eventKind: "CLASS",
  eventDate: "2026-10-05",
  dayOfWeek: 1,
  startTime: "08:30:00",
  endTime: "10:30:00",
  eventMode: "Face to face",
  venue: "SR 1",
  remarks: null,
  courseCode: "ICT235",
  semesterId: 1,
  scheduleType: "evening",
  groupCodeType: "TG",
  groupCode: "TG01",
  weekId: 1,
  weekNo: 1,
  weekType: "TEACHING",
  weekLabel: "Week 1",
  courseName: "Software Design",
  schoolName: null,
  shareKey: "ICT235-TG01",
};

describe("timetable exports", () => {
  it("uses the course code and group in ICS titles and keeps the scheduled times", () => {
    const ics = buildIcs(semester, [event]);
    expect(ics).toContain("SUMMARY:ICT235 (TG01)");
    expect(ics).toContain("DTSTART;TZID=Asia/Singapore:20261005T083000");
    expect(ics).toContain("DTEND;TZID=Asia/Singapore:20261005T103000");
    expect(ics).toContain("Course: Software Design\\nKind: CLASS\\nMode: Face to face\\nWeek: Week 1");
  });

  it("keeps a morning PDF block full width when only evening classes overlap", () => {
    const blocks = buildTimetableBlocks([
      event,
      { ...event, eventId: 2, courseCode: "ICT263", shareKey: "ICT263-CRN01", startTime: "19:00:00", endTime: "21:00:00", weekNo: 2 },
      { ...event, eventId: 3, courseCode: "ICT264", shareKey: "ICT264-CRN01", startTime: "19:00:00", endTime: "22:00:00" },
    ], "all");
    const lanes = buildPdfLanes(blocks);
    expect(lanes.get(blocks.find((block) => block.shareKey === event.shareKey)!.id)?.count).toBe(1);
    expect(lanes.get(blocks.find((block) => block.shareKey === "ICT263-CRN01")!.id)?.count).toBe(2);
    expect(lanes.get(blocks.find((block) => block.shareKey === "ICT264-CRN01")!.id)?.count).toBe(2);
    expect(lanes.get(blocks.find((block) => block.shareKey === "ICT264-CRN01")!.id)?.index).toBe(0);
    expect(lanes.get(blocks.find((block) => block.shareKey === "ICT263-CRN01")!.id)?.index).toBe(1);
  });

  it("supports the horizontal course panel and exam calendar as vector PDF views", async () => {
    const courses = [{
      shareKey: event.shareKey,
      courseCode: event.courseCode,
      courseName: event.courseName,
      groupCode: event.groupCode,
      examDateLabel: "5 Oct 2026",
      examTimeLabel: "08:30",
      examStatus: "dated" as const,
      examGuidance: null,
      creditUnits: 5,
      color: "#C9DFB2",
      hidden: false,
    }];
    const horizontal = await PDFDocument.load(await buildTimetablePdf(semester, [event], [], {
      orientation: "horizontal", courses,
    }));
    const examEvent = { ...event, eventId: 2, eventKind: "EXAM" as const };
    const exam = await PDFDocument.load(await buildTimetablePdf(semester, [event, examEvent], [], {
      viewMode: "exam", courses,
    }));
    expect(horizontal.getPageCount()).toBe(2);
    expect(exam.getPageCount()).toBe(2);
    expect(horizontal.getPage(0).getWidth()).toBeGreaterThan(horizontal.getPage(0).getHeight());
    expect(exam.getPage(0).getWidth()).toBeGreaterThan(exam.getPage(0).getHeight());
    const undated = await PDFDocument.load(await buildTimetablePdf(semester, [event], [], {
      viewMode: "exam",
      courses: [{ ...courses[0], examStatus: "undated", examDateLabel: "Proctored Online Exam", examTimeLabel: null,
        examGuidance: "Check with course instructor" }],
    }));
    expect(undated.getPageCount()).toBe(2);
  });

  it("creates a compact visual page followed by enough event-list pages", async () => {
    const events = Array.from({ length: 24 }, (_, index) => ({
      ...event,
      eventId: index + 1,
      eventDate: `2026-10-${String(index + 1).padStart(2, "0")}`,
      dayOfWeek: index % 5 + 1,
    }));
    const bytes = await buildTimetablePdf(semester, events, []);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
    expect(pdf.getPage(0).getHeight()).toBeLessThan(pdf.getPage(1).getHeight());
  });
});
