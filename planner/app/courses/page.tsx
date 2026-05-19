import { AppShell } from "@/components/layout/app-shell";
import { CourseSearchPage } from "@/components/courses/course-search-page";
import {
  getCourseSearchFacets,
  getSemesters,
  getSemestersWithWeeks,
  searchCourses,
} from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";
import { courseSearchSchema } from "@/lib/validation/timetable";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [allSemesters, semesterTree, facets, rawSearchParams] = await Promise.all([
    getSemesters(),
    getSemestersWithWeeks(),
    getCourseSearchFacets(),
    searchParams,
  ]);

  const { semester, week } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  const parsed = courseSearchSchema.parse({
    q: typeof rawSearchParams.q === "string" ? rawSearchParams.q : undefined,
    semesterId: typeof rawSearchParams.semesterId === "string" ? rawSearchParams.semesterId : undefined,
    scheduleType: typeof rawSearchParams.scheduleType === "string" ? rawSearchParams.scheduleType : undefined,
    postgraduate: typeof rawSearchParams.postgraduate === "string" ? rawSearchParams.postgraduate : undefined,
    school: typeof rawSearchParams.school === "string" ? rawSearchParams.school : undefined,
    courseLevel: typeof rawSearchParams.courseLevel === "string" ? rawSearchParams.courseLevel : undefined,
    limit: typeof rawSearchParams.limit === "string" ? rawSearchParams.limit : undefined,
  });

  const results = await searchCourses(
    parsed.q ?? "",
    parsed.semesterId,
    parsed.scheduleType,
    parsed.postgraduate,
    parsed.school,
    parsed.courseLevel,
    parsed.limit,
  );

  return (
    <AppShell activeSection="courses" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <CourseSearchPage
        semesters={allSemesters}
        schools={facets.schools}
        courseLevels={facets.courseLevels}
        filters={{
          q: parsed.q ?? "",
          semesterId: parsed.semesterId,
          scheduleType: parsed.scheduleType,
          postgraduate: parsed.postgraduate,
          school: parsed.school,
          courseLevel: parsed.courseLevel,
        }}
        results={results}
      />
    </AppShell>
  );
}
