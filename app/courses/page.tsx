import { AppShell } from "@/components/layout/app-shell";
import { CourseSearchPage } from "@/components/courses/course-search-page";
import { getCourseSearchFacets } from "@/lib/data/course-search";
import {
  getLatestDataUpdatedAt,
  getSemesters,
  getSemestersWithWeeks,
} from "@/lib/data/metadata";
import { parseCourseSearchFilters } from "@/lib/timetable/course-search";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [allSemesters, semesterTree, facets, latestDataUpdatedAt, rawSearchParams] = await Promise.all([
    getSemesters(),
    getSemestersWithWeeks(),
    getCourseSearchFacets(),
    getLatestDataUpdatedAt(),
    searchParams,
  ]);

  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  const parsed = parseCourseSearchFilters(rawSearchParams);

  return (
    <AppShell
      activeSection="courses"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <CourseSearchPage
        semesters={allSemesters}
        currentSemesterId={currentSemesterContext.semester?.semesterId ?? null}
        schools={facets.schools}
        courseLevels={facets.courseLevels}
        initialFilters={parsed}
      />
    </AppShell>
  );
}
