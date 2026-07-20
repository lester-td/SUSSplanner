import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { CourseDetailPage } from "@/components/courses/course-detail-page";
import {
  getAssessmentComponents,
  getCourseByCode,
  getCourseClasses,
  getCourseOfferedSemesters,
  getLatestDataUpdatedAt,
  getSemestersWithWeeks,
} from "@/lib/data/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";
import { optionalSemesterIdSchema } from "@/lib/validation/timetable";

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

  const course = await getCourseByCode(courseCode);
  if (!course)
  {
    notFound();
  }

  const [classes, assessments, offeredSemesters] = await Promise.all([
    getCourseClasses(courseCode, selectedSemesterId),
    getAssessmentComponents(courseCode),
    getCourseOfferedSemesters(courseCode),
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
        currentSemesterId={currentSemesterContext.semester?.semesterId ?? null}
        selectedSemesterId={selectedSemesterId}
        classes={classes}
        assessments={assessments}
      />
    </AppShell>
  );
}
