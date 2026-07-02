"use client";

import { useState } from "react";

import { GpaCalculatorClient } from "@/components/calculator/gpa-calculator-client";
import { OcasCalculatorClient } from "@/components/calculator/ocas-calculator-client";

type CalculatorMode = "gpa" | "ocas";

const calculatorModes: Array<{ id: CalculatorMode; label: string }> = [
  { id: "gpa", label: "GPA" },
  { id: "ocas", label: "OCAS" },
];

export function CalculatorsPageClient()
{
  const [mode, setMode] = useState<CalculatorMode>("gpa");

  return (
    <div className="calculators-page w-full">
      <div className="mb-5 flex flex-col gap-3">
        <h1 className="text-[30px] font-semibold leading-10 text-[var(--on-surface)]">
          Calculators
        </h1>
        <div
          className="inline-grid h-12 w-full grid-cols-2 rounded-[1rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1.5 sm:w-auto"
          role="tablist"
          aria-label="Calculator type"
        >
          {calculatorModes.map((item) => {
            const isActive = mode === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setMode(item.id)}
                className={`min-w-[7rem] rounded-[0.8rem] px-4 text-[14px] font-semibold leading-5 transition-colors ${
                  isActive
                    ? "calculator-primary-action bg-[var(--primary)] text-on-primary"
                    : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "gpa" ? <GpaCalculatorClient /> : <OcasCalculatorClient />}
    </div>
  );
}
