import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { CalculatorsPageClient } from "@/components/calculator/calculators-page-client";
import { getLatestDataUpdatedAt, getSemestersWithWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calculators | SUSS Planner",
  description: "Calculate GPA and simulate OCAS assessment outcomes for SUSS modules.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CalculatorsPage()
{
  const [semesterTree, latestDataUpdatedAt] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell
      activeSection="calculator"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <CalculatorsPageClient />
    </AppShell>
  );
}
