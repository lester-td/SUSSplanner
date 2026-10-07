import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { PlannerClient } from "@/components/timetable/planner-client";
import { getLatestDataUpdatedAt, getSemesters, getSemestersWithClassesAndWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";
import { getActiveSemesters } from "@/lib/timetable/semester-visibility";

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
  const visibleSemesters = getActiveSemesters(semesters);
  const currentSemesterContext = getCurrentSemesterContext(
    visibleSemesters.map(({ weeks, ...semesterData }) => semesterData),
    visibleSemesters.flatMap((item) => item.weeks),
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
        currentSemesterId={semester?.semesterId ?? visibleSemesters[0]?.semesterId ?? 0}
        currentWeekId={week?.weekId ?? null}
      />
    </AppShell>
  );
}
