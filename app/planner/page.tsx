import { AppShell } from "@/components/layout/app-shell";
import { SemesterPlannerClient } from "@/components/planner/semester-planner/client";
import { getLatestDataUpdatedAt, getSemesters, getSemestersWithWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export default async function PlannerPage()
{
  const [allSemesters, semesterTree, latestDataUpdatedAt] = await Promise.all([
    getSemesters(),
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
  ]);

  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell
      activeSection="semester-planner"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <SemesterPlannerClient semesters={allSemesters} />
    </AppShell>
  );
}
