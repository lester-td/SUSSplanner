import { AppShell } from "@/components/layout/app-shell";
import { SemesterPlannerClient } from "@/components/planner/semester-planner/client";
import { getSemesters, getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export default async function PlannerPage()
{
  const [allSemesters, semesterTree] = await Promise.all([
    getSemesters(),
    getSemestersWithWeeks(),
  ]);

  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="semester-planner" currentSemesterContext={currentSemesterContext}>
      <SemesterPlannerClient semesters={allSemesters} />
    </AppShell>
  );
}
