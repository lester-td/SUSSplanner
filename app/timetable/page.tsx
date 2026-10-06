import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PlannerClient } from "@/components/timetable/planner-client";
import { getLatestDataUpdatedAt, getSemesters, getSemestersWithClassesAndWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Timetable | SUSS Planner",
};

export default async function TimetablePage()
{
  const [semesters, allSemesters, latestDataUpdatedAt] = await Promise.all([
    getSemestersWithClassesAndWeeks(),
    getSemesters(),
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
        allSemesters={allSemesters}
        currentSemesterId={semester?.semesterId ?? semesters[0]?.semesterId ?? 0}
        currentWeekId={week?.weekId ?? null}
      />
    </AppShell>
  );
}
