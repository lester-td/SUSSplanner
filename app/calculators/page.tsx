import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { GpaCalculatorClient } from "@/components/calculator/gpa-calculator-client";
import { OcasCalculatorClient } from "@/components/calculator/ocas-calculator-client";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GPA & OCAS Calculators | SUSS Planner",
  description: "Calculate GPA and simulate OCAS assessment outcomes for SUSS modules.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CalculatorsPage()
{
  const semesterTree = await getSemestersWithWeeks();
  const { semester, week, isVacation } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="calculator" currentWeekLabel={getCurrentWeekChip(semester, week, isVacation)}>
      <div className="space-y-8">
        <GpaCalculatorClient />
        <OcasCalculatorClient />
      </div>
    </AppShell>
  );
}
