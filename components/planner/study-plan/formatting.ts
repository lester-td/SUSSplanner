import type { StudyPlanCourse } from "@/lib/planner/types";
import type { CourseSearchResult } from "@/lib/timetable/types";

export function formatCredits(value: number)
{
  return `${Number(value.toFixed(1)).toString()} CU`;
}

export function formatCreditCount(value: number)
{
  return `${Number(value.toFixed(1)).toString()} Credit Units`;
}

export function buildSemesterOptions(numSemesters: number)
{
  return Array.from({ length: numSemesters }, (_, index) => index);
}

export function formatOfferedSemesters(course: CourseSearchResult)
{
  const labels = course.offeredSemesters
    .slice(0, 3)
    .map((semester) => semester.semesterName.replace(/^Semester\s+/i, "Sem "));

  return labels.length > 0 ? labels.join(" • ") : "Semester offering unavailable";
}

export function sortCourses(courses: StudyPlanCourse[])
{
  return [...courses].sort((left, right) => left.courseCode.localeCompare(right.courseCode));
}
