import "server-only";

import { getSnapshotManifest } from "./manifest-reader";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getActiveSemesters, getSemesterChoices } from "@/lib/timetable/semester-visibility";

export type { AcademicCalendarEventRecord } from "./snapshot-types";

export async function getSemesters()
{
  const manifest = await getSnapshotManifest();
  return getActiveSemesters(manifest.semesters).map(({ weeks: _weeks, ...semester }) => semester);
}

export async function getVisibleSemesters()
{
  return getSemesterChoices(await getSemesters());
}

export async function getActiveAnnouncements(now = new Date())
{
  const manifest = await getSnapshotManifest();
  return getVisibleAnnouncements(manifest.announcements ?? [], now.getTime());
}

export async function getSemesterWeeks(semesterId?: number)
{
  const manifest = await getSnapshotManifest();
  const weeks = getActiveSemesters(manifest.semesters).flatMap((semester) => semester.weeks);
  return semesterId ? weeks.filter((week) => week.semesterId === semesterId) : weeks;
}

export async function getSemestersWithWeeks()
{
  const manifest = await getSnapshotManifest();
  return getActiveSemesters(manifest.semesters);
}

export async function getSemestersWithClassesAndWeeks()
{
  const manifest = await getSnapshotManifest();
  const semesterIdsWithClasses = new Set(Object.keys(manifest.scheduleBucketFiles).map(Number));
  return getActiveSemesters(manifest.semesters).filter(
    (semester) => semesterIdsWithClasses.has(semester.semesterId) && semester.weeks.length > 0,
  );
}

export async function getSemesterById(semesterId: number)
{
  const manifest = await getSnapshotManifest();
  const semester = getActiveSemesters(manifest.semesters).find((item) => item.semesterId === semesterId);
  if (!semester)
  {
    return null;
  }
  const { weeks: _weeks, ...semesterRecord } = semester;
  return semesterRecord;
}

export async function getLatestDataUpdatedAt()
{
  return (await getSnapshotManifest()).dataUpdatedAt;
}

export async function getHomePageDataCoverage()
{
  return (await getSnapshotManifest()).coverage;
}

export async function getUpcomingAcademicCalendarEvents(today: string)
{
  const manifest = await getSnapshotManifest();
  const visibleIds = new Set(getActiveSemesters(manifest.semesters).map(semester => semester.semesterId));
  return manifest.academicCalendarEvents.map(event => ({
    ...event,
    semesters: event.semesters.filter(semester => visibleIds.has(semester.semesterId) && !semester.isArchived),
  })).filter((event, index) => !manifest.academicCalendarEvents[index].semesters.length || event.semesters.length > 0).filter(
    (event) => event.endDate >= today && (event.status === "confirmed" || event.status === "tentative"),
  );
}
