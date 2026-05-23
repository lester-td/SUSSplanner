import { AppShell } from "@/components/layout/app-shell";
import { StudyPlanClient } from "@/components/planner/study-plan-client";
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
    <AppShell activeSection="study-plan" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <StudyPlanClient semesters={allSemesters} />
    </AppShell>
  );
}
