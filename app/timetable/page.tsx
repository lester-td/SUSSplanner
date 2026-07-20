import { AppShell } from "@/components/layout/app-shell";
import { PlannerClient } from "@/components/timetable/planner-client";
import { getLatestDataUpdatedAt, getSemestersWithClassesAndWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export default async function TimetablePage()
{
  const [semesters, latestDataUpdatedAt] = await Promise.all([
    getSemestersWithClassesAndWeeks(),
    getLatestDataUpdatedAt(),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesters.map(({ weeks, ...semesterData }) => semesterData),
    semesters.flatMap((item) => item.weeks),
  );
  const { semester, week } = currentSemesterContext;

  return (
    <AppShell
      activeSection="planner"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
      contentLayout="full-bleed"
    >
      <PlannerClient
        semesters={semesters}
        currentSemesterId={semester?.semesterId ?? semesters[0]?.semesterId ?? 0}
        currentWeekId={week?.weekId ?? null}
      />
    </AppShell>
  );
}
