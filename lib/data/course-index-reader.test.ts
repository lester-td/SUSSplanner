import { expect, it, vi } from "vitest";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";
import type { CourseClassRecord } from "@/lib/timetable/types";

vi.mock("server-only", () => ({}));
vi.mock("./snapshot-cache", () => ({ readCachedJson: vi.fn() }));
vi.mock("./schedule-snapshot-reader", () => ({ getScheduleSnapshot: vi.fn() }));
import { readCachedJson } from "./snapshot-cache";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";
import { getCourseIndexSnapshot } from "./course-index-reader";

it("counts new starts and excludes semesters containing only continuation sessions from course search", async () => {
  const record: CourseIndexSnapshotRecord = {
    courseCode: "NIE301", courseName: "Learning", schoolName: null, isPostgraduate: false,
    courseLevel: "3", creditUnits: 5, presentationPattern: null, courseSynopsis: null,
    hasAvailableClasses: true, availableClassCount: 3, scheduleTypes: ["daytime"],
    availableAsGsp: true, assessmentModes: [],
    offeredSemesters: [
      { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026" },
      { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026" },
      { semesterId: 14, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027" },
    ],
    offerings: [1, 3, 14].map(semesterId => ({ semesterId, scheduleType: "daytime", classCount: 1, availableAsGsp: true })),
  };
  vi.mocked(readCachedJson).mockResolvedValue([record]);
  vi.mocked(getScheduleSnapshot).mockImplementation(async semesterId => {
    const group: CourseClassRecord = {
      classId: semesterId, semesterId, courseCode: "NIE301", courseName: "Learning", schoolName: null,
      creditUnits: 5, presentationPattern: null, scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG16",
      availableAsGsp: false, isRestricted: false, remarks: null,
      events: [{
        eventId: semesterId, classId: semesterId, semesterId, startSemesterId: semesterId === 14 ? 3 : semesterId,
        courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG16",
        eventKind: "CLASS", eventDate: "2026-09-12", dayOfWeek: 6, startTime: "15:30:00", endTime: "18:30:00",
        eventMode: null, venue: null, remarks: null, weekId: null, weekNo: null, weekType: null, weekLabel: null,
      }],
    };
    return { semesterId, courseCode: "NIE301", classes: [group] };
  });
  const [result] = await getCourseIndexSnapshot();
  expect(result.availableClassCount).toBe(2);
  expect(result.offerings.map(offering => offering.semesterId)).toEqual([1, 3]);
  expect(result.offeredSemesters.map(semester => semester.semesterId)).toEqual([1, 3, 14]);
  expect(result.availableAsGsp).toBe(false);
});
