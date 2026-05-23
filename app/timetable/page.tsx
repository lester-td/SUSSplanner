import { AppShell } from "@/components/layout/app-shell";
import { PlannerClient } from "@/components/timetable/planner-client";
import { getSemestersWithClassesAndWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export default async function TimetablePage()
{
  const semesters = await getSemestersWithClassesAndWeeks();
  const { semester, week } = getCurrentSemesterContext(
    semesters.map(({ weeks, ...semesterData }) => semesterData),
    semesters.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="planner" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <PlannerClient
        semesters={semesters}
        currentSemesterId={semester?.semesterId ?? semesters[0]?.semesterId ?? 0}
        currentWeekId={week?.weekId ?? null}
      />
    </AppShell>
  );
}
