import { AppShell } from "@/components/layout/app-shell";
import { CourseSearchPage } from "@/components/courses/course-search-page";
import {
  getCourseSearchFacets,
  getSemesters,
  getSemestersWithWeeks,
} from "@/lib/db/queries";
import { parseCourseSearchFilters } from "@/lib/timetable/course-search";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

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

  const { semester, week, isVacation } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  const parsed = parseCourseSearchFilters(rawSearchParams);

  return (
    <AppShell
      activeSection="courses"
      currentWeekLabel={getCurrentWeekChip(semester, week, isVacation)}
    >
      <CourseSearchPage
        semesters={allSemesters}
        schools={facets.schools}
        courseLevels={facets.courseLevels}
        initialFilters={parsed}
      />
    </AppShell>
  );
}
