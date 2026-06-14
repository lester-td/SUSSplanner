import type { Metadata } from "next";

import { GpaCalculatorClient } from "@/components/calculator/gpa-calculator-client";
import { AppShell } from "@/components/layout/app-shell";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GPA Calculator | SUSS Planner",
  description: "Calculate current and cumulative SUSS GPA.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CalculatorPage()
{
  const semesterTree = await getSemestersWithWeeks();
  const { semester, week } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection={null} currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <GpaCalculatorClient />
    </AppShell>
  );
}
