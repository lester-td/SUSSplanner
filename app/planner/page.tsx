import { AppShell } from "@/components/layout/app-shell";
import { SemesterPlannerClient } from "@/components/planner/semester-planner/client";
import { getSemesters, getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export default async function PlannerPage()
{
  const [allSemesters, semesterTree] = await Promise.all([
    getSemesters(),
    getSemestersWithWeeks(),
  ]);

  const { semester, week } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="semester-planner" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <SemesterPlannerClient semesters={allSemesters} />
    </AppShell>
  );
}
