import "server-only";

import { getSnapshotManifest } from "./manifest-reader";

export type { AcademicCalendarEventRecord } from "./snapshot-types";

export async function getSemesters()
{
  const manifest = await getSnapshotManifest();
  return manifest.semesters.map(({ weeks: _weeks, ...semester }) => semester);
}

export async function getSemesterWeeks(semesterId?: number)
{
  const manifest = await getSnapshotManifest();
  const weeks = manifest.semesters.flatMap((semester) => semester.weeks);
  return semesterId ? weeks.filter((week) => week.semesterId === semesterId) : weeks;
}

export async function getSemestersWithWeeks()
{
  const manifest = await getSnapshotManifest();
  return manifest.semesters;
}

export async function getSemestersWithClassesAndWeeks()
{
  const manifest = await getSnapshotManifest();
  const semesterIdsWithClasses = new Set(Object.keys(manifest.scheduleBucketFiles).map(Number));
  return manifest.semesters.filter(
    (semester) => semesterIdsWithClasses.has(semester.semesterId) && semester.weeks.length > 0,
  );
}

export async function getSemesterById(semesterId: number)
{
  const manifest = await getSnapshotManifest();
  const semester = manifest.semesters.find((item) => item.semesterId === semesterId);
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
  return manifest.academicCalendarEvents.filter(
    (event) => event.endDate >= today && (event.status === "confirmed" || event.status === "tentative"),
  );
}
