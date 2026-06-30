import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { GpaCalculatorClient } from "@/components/calculator/gpa-calculator-client";
import { OcasCalculatorClient } from "@/components/calculator/ocas-calculator-client";
import { getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

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
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="calculator" currentSemesterContext={currentSemesterContext}>
      <div className="calculators-stack flex flex-col gap-10 md:gap-12">
        <GpaCalculatorClient />
        <OcasCalculatorClient />
      </div>
    </AppShell>
  );
}
