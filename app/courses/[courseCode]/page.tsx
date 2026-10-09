import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { CourseDetailPage } from "@/components/courses/course-detail-page";
import {
  getCourseByCode,
  getCourseDetailSnapshot,
  getCourseClasses,
  getCoursePostrequisites,
  getCoursePrerequisites,
} from "@/lib/data/course-details";
import {
  getLatestDataUpdatedAt,
  getSemestersWithWeeks,
} from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";
import { optionalSemesterIdSchema } from "@/lib/validation/timetable";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ courseCode: string }>;
}): Promise<Metadata>
{
  const { courseCode } = await params;
  const course = await getCourseByCode(courseCode);

  return {
    title: course
      ? `${course.courseCode}${course.courseName ? `: ${course.courseName}` : ""} | SUSS Planner`
      : "Course | SUSS Planner",
  };
}

export default async function CourseDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ courseCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [{ courseCode }, rawSearchParams, semesterTree, latestDataUpdatedAt] = await Promise.all([
    params,
    searchParams,
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
  ]);

  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  const selectedSemesterId = optionalSemesterIdSchema.parse(
    typeof rawSearchParams.semesterId === "string" ? rawSearchParams.semesterId : undefined,
  );

  const snapshot = await getCourseDetailSnapshot(courseCode);
  if (!snapshot)
  {
    notFound();
  }

  const { course, assessments, offeredSemesters, requisites } = snapshot;
  const scheduledSemesters = snapshot.scheduledSemesters ?? offeredSemesters;
  const [classes, postrequisites, prerequisites] = await Promise.all([
    getCourseClasses(courseCode, selectedSemesterId),
    getCoursePostrequisites(course.courseCode, requisites),
    getCoursePrerequisites(course.courseCode, requisites),
  ]);

  return (
    <AppShell
      activeSection="courses"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <CourseDetailPage
        course={course}
        offeredSemesters={offeredSemesters}
        scheduledSemesters={scheduledSemesters}
        currentSemesterId={currentSemesterContext.semester?.semesterId ?? null}
        selectedSemesterId={offeredSemesters.some(semester => semester.semesterId === selectedSemesterId) ? selectedSemesterId : undefined}
        classes={classes}
        assessments={assessments}
        requisites={requisites}
        postrequisites={postrequisites}
        prerequisites={prerequisites}
      />
    </AppShell>
  );
}
