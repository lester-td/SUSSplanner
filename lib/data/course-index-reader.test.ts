import { beforeEach, expect, it, vi } from "vitest";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";

vi.mock("server-only", () => ({}));
vi.mock("./manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
import { getSnapshotManifest } from "./manifest-reader";
vi.mock("./snapshot-cache", () => ({ readCachedJson: vi.fn() }));
vi.mock("./schedule-snapshot-reader", () => ({ getScheduleSnapshot: vi.fn() }));
import { readCachedJson } from "./snapshot-cache";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(["NIE301", "NIE351"])("uses generated starting counts and excludes zero-count offerings for %s without reading schedules", async courseCode => {
  const record: CourseIndexSnapshotRecord = {
    courseCode, courseName: "Learning", schoolName: null, isPostgraduate: false,
    courseLevel: "3", creditUnits: 5, presentationPattern: null, courseSynopsis: null,
    hasAvailableClasses: true, availableClassCount: 3, scheduleTypes: ["daytime"],
    availableAsGsp: true, assessmentModes: [],
    offeredSemesters: [
      { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026" },
      { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026" },
      { semesterId: 14, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027" },
    ],
    offerings: [
      { semesterId: 1, scheduleType: "daytime", classCount: 1, availableAsGsp: false },
      { semesterId: 3, scheduleType: "evening", classCount: 2, availableAsGsp: false },
      { semesterId: 14, scheduleType: "daytime", classCount: 0, availableAsGsp: true },
    ],
  };
  vi.mocked(getSnapshotManifest).mockResolvedValue({ semesters: record.offeredSemesters } as import("./snapshot-types").DataSnapshotManifest);
  vi.mocked(readCachedJson).mockResolvedValue([record]);
  const { getCourseIndexSnapshot } = await import("./course-index-reader");
  const [result] = await getCourseIndexSnapshot();
  expect(result.availableClassCount).toBe(3);
  expect(result.offerings.map(offering => offering.classCount)).toEqual([1, 2]);
  expect(result.offerings.map(offering => offering.semesterId)).toEqual([1, 3]);
  expect(result.offeredSemesters.map(semester => semester.semesterId)).toEqual([1, 3, 14]);
  expect(result.availableAsGsp).toBe(false);
  expect(result.scheduleTypes).toEqual(["daytime", "evening"]);
  expect(getScheduleSnapshot).not.toHaveBeenCalled();
});


it("removes archived offering metadata and recalculates availability for a single-term course", async () => {
  const semesters = [
    { semesterId: 1, academicYear: "2025/2026", semesterNo: 2 as const, semesterName: "January 2026", isArchived: true },
    { semesterId: 3, academicYear: "2026/2027", semesterNo: 1 as const, semesterName: "July 2026" },
  ];
  vi.mocked(getSnapshotManifest).mockResolvedValue({ semesters: semesters.map(semester => ({ ...semester, weeks: [] })) } as unknown as import("./snapshot-types").DataSnapshotManifest);
  vi.mocked(readCachedJson).mockResolvedValue([{
    courseCode: "ACC201", offeredSemesters: semesters.map(semester => ({ ...semester, semesterName: "Old name" })), hasAvailableClasses: true, availableClassCount: 5,
    scheduleTypes: ["daytime", "evening"], availableAsGsp: true,
    offerings: [
      { semesterId: 1, scheduleType: "daytime", classCount: 4, availableAsGsp: true },
      { semesterId: 3, scheduleType: "evening", classCount: 1, availableAsGsp: false },
    ],
  }]);
  const { getCourseIndexSnapshot: readIndex } = await import("./course-index-reader");
  const [result] = await readIndex();
  expect(result.offeredSemesters).toEqual([semesters[1]]);
  expect(result.scheduledSemesters).toEqual([semesters[1]]);
  expect(result.offerings.map(offering => offering.semesterId)).toEqual([3]);
  expect(result.availableClassCount).toBe(1);
  expect(result.scheduleTypes).toEqual(["evening"]);
  expect(result.availableAsGsp).toBe(false);
});

it("hides unavailable intakes and recalculates class counts while retaining continuation destinations", async () => {
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

it("shares concurrent and warm index promises and retries after manifest failure", async () => {
  vi.mocked(readCachedJson).mockResolvedValue([]);
  vi.mocked(getSnapshotManifest).mockRejectedValueOnce(new Error("Unsupported data snapshot format"))
    .mockResolvedValue({ semesters: [] } as unknown as import("./snapshot-types").DataSnapshotManifest);
  const { getCourseIndexSnapshot } = await import("./course-index-reader");
  const failed = getCourseIndexSnapshot();
  expect(getCourseIndexSnapshot()).toBe(failed);
  await expect(failed).rejects.toThrow("Unsupported data snapshot format");
  const retry = getCourseIndexSnapshot();
  expect(getCourseIndexSnapshot()).toBe(retry);
  await expect(retry).resolves.toEqual([]);
  expect(getCourseIndexSnapshot()).toBe(retry);
  expect(readCachedJson).toHaveBeenCalledTimes(2);
  expect(getSnapshotManifest).toHaveBeenCalledTimes(2);
});
