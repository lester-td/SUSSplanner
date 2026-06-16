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
  const { semester, week } = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell activeSection="calculator" currentWeekLabel={getCurrentWeekChip(semester, week)}>
      <div className="space-y-8">
        <section className="mx-auto w-full max-w-7xl px-3 pt-8 md:px-4">
          <div className="max-w-3xl">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
              Calculators
            </p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.04em] text-[var(--on-surface)]">
              GPA and OCAS calculators
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
              Use the GPA calculator for cumulative planning, then estimate OCAS outcomes using a course&apos;s assessment strategy below.
            </p>
          </div>
        </section>

        <GpaCalculatorClient />
        <OcasCalculatorClient />
      </div>
    </AppShell>
  );
}
