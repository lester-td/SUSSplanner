import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnnouncementRecord, DataSnapshotManifest } from "./snapshot-types";

vi.mock("server-only", () => ({}));
vi.mock("./manifest-reader", () => ({ getSnapshotManifest: vi.fn() }));
import { getSnapshotManifest } from "./manifest-reader";
import { getActiveAnnouncements, getSemesterById, getSemesters, getVisibleSemesters, getSemestersWithWeeks, getSemestersWithClassesAndWeeks, getSemesterWeeks, getUpcomingAcademicCalendarEvents } from "./metadata";

const manifest: DataSnapshotManifest = {
  formatVersion: 1, generatedAt: "2026-10-06T00:00:00Z", dataUpdatedAt: null,
  coverage: { courseCount: 0, classCount: 0, semesterCount: 3, assessmentCount: 0 },
  semesters: [
    { semesterId: 1, academicYear: "2025/2026", semesterNo: 2, semesterName: "January 2026", isArchived: true, weeks: [] },
    { semesterId: 2, academicYear: "2025/2026", semesterNo: 3, semesterName: "May 2026", weeks: [] },
    { semesterId: 3, academicYear: "2026/2027", semesterNo: 1, semesterName: "July 2026", isArchived: false, weeks: [] },
  ],
  academicCalendarEvents: [], courseBucketFiles: {}, scheduleBucketFiles: {},
};
const announcement: AnnouncementRecord = {
  announcementId: 1, message: "January & May 2027 course schedules are now available.",
  linkUrl: "/courses", linkLabel: "View courses", enabled: true, sortOrder: 1,
  publishAt: "2026-10-06T09:00:00+08:00", expiresAt: "2026-10-07T09:00:00+08:00",
};

beforeEach(() => {
  vi.mocked(getSnapshotManifest).mockResolvedValue(manifest);
});

describe("archived semester metadata", () => {
  it("excludes archived semesters from all frontend metadata readers", async () => {
    expect((await getVisibleSemesters()).map(semester => semester.semesterId)).toEqual([2, 3]);
    expect((await getSemesters()).map(semester => semester.semesterId)).toEqual([2, 3]);
    expect(await getSemesterById(1)).toBeNull();
    expect((await getSemestersWithWeeks()).map(semester => semester.semesterId)).toEqual([2, 3]);
    expect(await getSemesterWeeks(1)).toEqual([]);
  });

  it("removes archived calendar associations and events linked only to archived terms", async () => {
    const event = {
      eventId: 1, calendarYear: 2026, audience: "PTUG" as const, eventTitle: "Registration",
      eventCategory: "registration", startDate: "2026-10-01", endDate: "2026-10-31",
      status: "confirmed" as const, sourceUrl: null, remarks: null, sortOrder: 1,
    };
    vi.mocked(getSnapshotManifest).mockResolvedValue({ ...manifest, academicCalendarEvents: [
      { ...event, semesters: [manifest.semesters[0]] },
      { ...event, eventId: 2, semesters: [manifest.semesters[0], manifest.semesters[2]] },
      { ...event, eventId: 3, semesters: [] },
    ] });
    const result = await getUpcomingAcademicCalendarEvents("2026-10-06");
    expect(result.map(item => item.eventId)).toEqual([2, 3]);
    expect(result[0].semesters.map(semester => semester.semesterId)).toEqual([3]);
  });

});

it("keeps an unavailable intake's calendar and timetable accessible without exposing it as a filter choice", async () => {
  const july = {
    semesterId: 4, academicYear: "2027/2028", semesterNo: 1 as const,
    semesterName: "July 2027", hasIntakeSchedule: false, weeks: [{
      semesterId: 4, weekId: 41, weekNo: 1, weekType: "TEACHING" as const,
      label: "Week 1", startDate: "2027-08-09", endDate: "2027-08-15",
    }],
  };
  vi.mocked(getSnapshotManifest).mockResolvedValue({ ...manifest,
    semesters: [...manifest.semesters, july], scheduleBucketFiles: { "4": { "00": "schedules/4-00.json" } },
  });
  expect((await getVisibleSemesters()).map(semester => semester.semesterId)).toEqual([2, 3]);
  expect((await getSemesters()).map(semester => semester.semesterId)).toEqual([2, 3, 4]);
  expect(await getSemesterById(4)).toMatchObject({ hasIntakeSchedule: false });
  expect(await getSemesterWeeks(4)).toEqual(july.weeks);
  expect(await getSemestersWithClassesAndWeeks()).toEqual([july]);
});

describe("announcement publication windows", () => {
  it("supports older snapshots with no announcement data", async () => {
    expect(await getActiveAnnouncements()).toEqual([]);
  });

  it.each([
    ["2026-10-06T08:59:59+08:00", 0],
    ["2026-10-06T09:00:00+08:00", 1],
    ["2026-10-07T08:59:59+08:00", 1],
    ["2026-10-07T09:00:00+08:00", 0],
  ])("evaluates publication and expiry at %s", async (now, expectedCount) => {
    vi.mocked(getSnapshotManifest).mockResolvedValue({ ...manifest, announcements: [announcement] });
    expect(await getActiveAnnouncements(new Date(now))).toHaveLength(expectedCount);
  });

  it("excludes disabled messages and orders active messages with optional expiry", async () => {
    vi.mocked(getSnapshotManifest).mockResolvedValue({
      ...manifest,
      announcements: [
        { ...announcement, announcementId: 2, sortOrder: 2 },
        { ...announcement, enabled: false },
        { ...announcement, announcementId: 4, sortOrder: 1, expiresAt: null },
        { ...announcement, announcementId: 3, sortOrder: 1, expiresAt: null },
      ],
    });
    expect((await getActiveAnnouncements(new Date("2026-10-06T10:00:00+08:00"))).map(item => item.announcementId)).toEqual([3, 4, 2]);
  });
});
