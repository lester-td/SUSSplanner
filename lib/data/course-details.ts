import "server-only";

import { getCourseSnapshot } from "./course-snapshot-reader";
import { getScheduleSnapshot } from "./schedule-snapshot-reader";

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
}

export async function getCourseByCode(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.course ?? null;
}

export async function getCourseOfferedSemesters(courseCode: string)
{
  return (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.offeredSemesters ?? [];
}

export async function getAssessmentComponents(
  courseCode: string,
  scheduleType?: "daytime" | "evening",
)
{
  const assessments = (await getCourseSnapshot(normalizeCourseCode(courseCode)))?.assessments ?? [];
  return scheduleType
    ? assessments.filter((assessment) => assessment.scheduleType === scheduleType)
    : assessments;
}

export async function getCourseClasses(
  courseCode: string,
  semesterId?: number,
  scheduleType?: "daytime" | "evening",
)
{
  const normalizedCourseCode = normalizeCourseCode(courseCode);
  const course = await getCourseSnapshot(normalizedCourseCode);
  if (!course)
  {
    return [];
  }

  const semesterIds = semesterId
    ? [semesterId]
    : course.offeredSemesters.map((semester) => semester.semesterId);
  const snapshots = await Promise.all(
    semesterIds.map((id) => getScheduleSnapshot(id, normalizedCourseCode)),
  );

  return snapshots
    .flatMap((snapshot) => snapshot?.classes ?? [])
    .filter((item) => !scheduleType || item.scheduleType === scheduleType)
    .sort((left, right) => (
      left.scheduleType.localeCompare(right.scheduleType)
      || left.groupCodeType.localeCompare(right.groupCodeType)
      || left.groupCode.localeCompare(right.groupCode, undefined, { numeric: true })
    ));
}

export async function getClassCountsByCourseCodes(courseCodes: string[], semesterId: number)
{
  const normalizedCourseCodes = [...new Set(courseCodes.map(normalizeCourseCode))];
  const schedules = await Promise.all(
    normalizedCourseCodes.map((courseCode) => getScheduleSnapshot(semesterId, courseCode)),
  );

  return Object.fromEntries(normalizedCourseCodes.map((courseCode, index) => [
    courseCode,
    schedules[index]?.classes.length ?? 0,
  ]));
}
