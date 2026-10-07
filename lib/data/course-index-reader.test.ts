import { expect, it, vi } from "vitest";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";
import type { CourseClassRecord } from "@/lib/timetable/types";

vi.mock("server-only", () => ({}));
vi.mock("./manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
import { getSnapshotManifest } from "./manifest-reader";
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
  vi.mocked(getSnapshotManifest).mockResolvedValue({ semesters: record.offeredSemesters } as import("./snapshot-types").DataSnapshotManifest);
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
        eventMode: null, campus: null, remarks: null, weekId: null, weekNo: null, weekType: null, weekLabel: null,
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


it("removes archived offering metadata and recalculates availability for a single-term course", async () => {
  vi.resetModules();
  const semesters = [
    { semesterId: 1, academicYear: "2025/2026", semesterNo: 2 as const, semesterName: "January 2026", isArchived: true },
    { semesterId: 3, academicYear: "2026/2027", semesterNo: 1 as const, semesterName: "July 2026" },
  ];
  vi.mocked(getSnapshotManifest).mockResolvedValue({ semesters } as import("./snapshot-types").DataSnapshotManifest);
  vi.mocked(readCachedJson).mockResolvedValue([{
    courseCode: "ACC201", offeredSemesters: semesters, hasAvailableClasses: true, availableClassCount: 5,
    scheduleTypes: ["daytime", "evening"], availableAsGsp: true,
    offerings: [
      { semesterId: 1, scheduleType: "daytime", classCount: 4, availableAsGsp: true },
      { semesterId: 3, scheduleType: "evening", classCount: 1, availableAsGsp: false },
    ],
  }]);
  const { getCourseIndexSnapshot: readIndex } = await import("./course-index-reader");
  const [result] = await readIndex();
  expect(result.offeredSemesters.map(semester => semester.semesterId)).toEqual([3]);
  expect(result.offerings.map(offering => offering.semesterId)).toEqual([3]);
  expect(result.availableClassCount).toBe(1);
  expect(result.scheduleTypes).toEqual(["evening"]);
  expect(result.availableAsGsp).toBe(false);
});

it("hides unavailable intakes and recalculates class counts while retaining continuation destinations", async () => {
  vi.resetModules();
  const semesters = [
    { semesterId: 2, academicYear: "2026/2027", semesterNo: 3 as const, semesterName: "May 2027", hasIntakeSchedule: true },
    { semesterId: 3, academicYear: "2027/2028", semesterNo: 1 as const, semesterName: "July 2027", hasIntakeSchedule: false },
  ];
  vi.mocked(getSnapshotManifest).mockResolvedValue({ semesters } as import("./snapshot-types").DataSnapshotManifest);
  vi.mocked(readCachedJson).mockResolvedValue([{
    courseCode: "ACC201", offeredSemesters: semesters.map(({ hasIntakeSchedule: _available, ...semester }) => semester),
    hasAvailableClasses: true, availableClassCount: 5, scheduleTypes: ["daytime", "evening"], availableAsGsp: true,
    offerings: [
      { semesterId: 2, scheduleType: "evening", classCount: 1, availableAsGsp: false },
      { semesterId: 3, scheduleType: "daytime", classCount: 4, availableAsGsp: true },
    ],
  }]);
  const { getCourseIndexSnapshot: readIndex } = await import("./course-index-reader");
  const [result] = await readIndex();
  expect(result.offeredSemesters).toEqual([semesters[0]]);
  expect(result.scheduledSemesters).toEqual(semesters);
  expect(result.offerings.map(offering => offering.semesterId)).toEqual([2]);
  expect(result.availableClassCount).toBe(1);
  expect(result.scheduleTypes).toEqual(["evening"]);
  expect(result.availableAsGsp).toBe(false);
});
