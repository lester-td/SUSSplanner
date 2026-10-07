import { expect, it, vi } from "vitest";
import type { DataSnapshotManifest } from "./snapshot-types";
import { getDataSnapshotBucket } from "./snapshot-types";

vi.mock("server-only", () => ({}));
vi.mock("./snapshot-cache", () => ({ readCachedJson: vi.fn() }));
vi.mock("./manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
import { getSnapshotManifest } from "./manifest-reader";
import { readCachedJson } from "./snapshot-cache";
import { getCourseSnapshot } from "./course-snapshot-reader";

it("does not expose archived semesters from a legacy course shard", async () => {
  const semesters = [
    { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: true },
    { semesterId: 2, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026" },
  ];
  vi.mocked(getSnapshotManifest).mockResolvedValue({
    semesters, courseBucketFiles: { [getDataSnapshotBucket("ACC201")]: "courses/00.json" },
  } as unknown as DataSnapshotManifest);
  // Old course metadata might not yet have the flag present on each offering.
  vi.mocked(readCachedJson).mockResolvedValue({ ACC201: {
    course: { courseCode: "ACC201" }, assessments: [],
    offeredSemesters: semesters.map(({ isArchived: _archived, ...semester }) => semester),
  } });
  const course = await getCourseSnapshot("acc201");
  expect(course?.offeredSemesters.map(semester => semester.semesterId)).toEqual([2]);
});

it("separates unavailable continuation destinations from course offering choices", async () => {
  const semesters = [
    { semesterId: 2, academicYear: "2026/2027", semesterNo: 3 as const, semesterName: "May 2027", hasIntakeSchedule: true },
    { semesterId: 3, academicYear: "2027/2028", semesterNo: 1 as const, semesterName: "July 2027", hasIntakeSchedule: false },
  ];
  vi.mocked(getSnapshotManifest).mockResolvedValue({
    semesters, courseBucketFiles: { [getDataSnapshotBucket("NIE351")]: "courses/00.json" },
  } as unknown as DataSnapshotManifest);
  vi.mocked(readCachedJson).mockResolvedValue({ NIE351: {
    course: { courseCode: "NIE351" }, assessments: [],
    // Legacy shards do not carry the new flag; the manifest controls availability.
    offeredSemesters: semesters.map(({ hasIntakeSchedule: _available, ...semester }) => semester),
  } });
  const course = await getCourseSnapshot("NIE351");
  expect(course?.offeredSemesters).toEqual([semesters[0]]);
  expect(course?.scheduledSemesters).toEqual(semesters);
});
