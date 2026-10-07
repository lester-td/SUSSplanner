import { beforeEach, expect, it, vi } from "vitest";
import type { ClassEventWithWeekRecord } from "@/lib/timetable/types";
import { getDataSnapshotBucket } from "./snapshot-types";

vi.mock("server-only", () => ({}));
vi.mock("./snapshot-cache", () => ({ readCachedJson: vi.fn() }));
vi.mock("./manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
import { readCachedJson } from "./snapshot-cache";
import { getSnapshotManifest } from "./manifest-reader";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";

const event: ClassEventWithWeekRecord = {
  eventId: 1, classId: 1, semesterId: 1, courseCode: "ACC201",
  scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN01",
  eventKind: "CLASS", eventDate: "2027-01-12", dayOfWeek: 2,
  startTime: "19:00:00", endTime: "22:00:00", eventMode: "FACE-TO-FACE",
  campus: "CLE", remarks: null, weekId: null, weekNo: null, weekType: null, weekLabel: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSnapshotManifest).mockResolvedValue({
    formatVersion: 1, generatedAt: "2026-10-06T00:00:00Z", dataUpdatedAt: null,
    coverage: { courseCount: 1, classCount: 1, semesterCount: 1, assessmentCount: 0 },
    semesters: [{ semesterId: 1, academicYear: "2026/2027", semesterNo: 2, semesterName: "January 2027", weeks: [] }],
    academicCalendarEvents: [], courseBucketFiles: {},
    scheduleBucketFiles: { "1": { [getDataSnapshotBucket("ACC201")]: "schedules/1-00.json" } },
  });
});

it.each([
  { campus: "AMK", venue: "CLE", expected: "AMK" },
  { campus: "ONL", expected: "ONL" },
  { venue: "CLE", expected: "CLE" },
  { expected: null },
])("reads campus from current and legacy snapshots: %j", async ({ expected, ...location }) => {
  const { campus: _campus, ...withoutCampus } = event;
  vi.mocked(readCachedJson).mockResolvedValue({
    semesterId: 1, courses: { ACC201: [{ events: [{ ...withoutCampus, ...location }] }] },
  });
  const snapshot = await getScheduleSnapshot(1, "acc201");
  const imported = snapshot!.classes[0].events[0];
  expect(imported.campus).toBe(expected);
  expect(imported).not.toHaveProperty("venue");
  expect(imported.startSemesterId).toBe(1);
});


it("refuses an archived schedule even if an older manifest still lists its file", async () => {
  const manifest = await getSnapshotManifest();
  vi.mocked(getSnapshotManifest).mockResolvedValue({ ...manifest, semesters: manifest.semesters.map(semester => ({ ...semester, isArchived: true })) });
  expect(await getScheduleSnapshot(1, "ACC201")).toBeNull();
  expect(readCachedJson).not.toHaveBeenCalled();
});

it("preserves build-time ownership when the archived origin is absent from the manifest", async () => {
  vi.mocked(readCachedJson).mockResolvedValue({
    semesterId: 1, courses: { ACC201: [{ events: [{ ...event, startSemesterId: 99 }] }] },
  });
  expect((await getScheduleSnapshot(1, "ACC201"))!.classes[0].events[0].startSemesterId).toBe(99);
});
