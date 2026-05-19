import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { CourseDetailPage } from "@/components/courses/course-detail-page";
import {
  getAssessmentComponents,
  getCourseByCode,
  getCourseClasses,
  getSemesters,
  getSemestersWithWeeks,
} from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";
import { optionalSemesterIdSchema } from "@/lib/validation/timetable";

export default async function CourseDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ courseCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [{ courseCode }, rawSearchParams, semesters, semesterTree] = await Promise.all([
    params,
    searchParams,
    getSemesters(),
    getSemestersWithWeeks(),
  ]);

  const { semester, week } = getCurrentSemesterContext(
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

  const [classes, assessments] = await Promise.all([
    getCourseClasses(courseCode, selectedSemesterId),
    getAssessmentComponents(courseCode),
  ]);

  return (
    <AppShell activeSection="courses" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <CourseDetailPage
        course={course}
        semesters={semesters}
        selectedSemesterId={selectedSemesterId}
        classes={classes}
        assessments={assessments}
      />
    </AppShell>
  );
}
