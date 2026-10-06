"use client";

import "./calculator-mobile.css";

import { useState } from "react";

import { GpaCalculatorClient } from "@/components/calculator/gpa-calculator-client";
import { OcasCalculatorClient } from "@/components/calculator/ocas-calculator-client";
import { CalculatorIcon, SchoolIcon } from "@/components/planner/icons";

type CalculatorMode = "gpa" | "ocas";

const calculatorModes: Array<{ id: CalculatorMode; label: string }> = [
  { id: "gpa", label: "GPA" },
  { id: "ocas", label: "OCAS" },
];

export function CalculatorsPageClient()
{
  const [mode, setMode] = useState<CalculatorMode>("gpa");

  return (
    <div className="calculators-page grid w-full gap-5 lg:gap-6">
      <header className="pb-1 pt-3 sm:pb-0 md:pt-8">
        <div>
          <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">
            Calculators
          </h1>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:mt-2 sm:text-[15px] sm:leading-7">
            Forecast your GPA and assessment outcomes
          </p>
        </div>
      </header>

      <div className="grid min-w-0 gap-4 sm:gap-5">
        <div
          className="calculator-mode-switch"
          role="group"
          aria-label="Calculator type"
        >
          {calculatorModes.map((item) => {
            const isActive = mode === item.id;

            return (
              <button
                key={item.id}
                type="button"
                id={`calculator-mode-${item.id}`}
                aria-controls={`calculator-panel-${item.id}`}
                aria-pressed={isActive}
                onClick={() => setMode(item.id)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const nextMode = event.key === "Home" ? "gpa" : event.key === "End" ? "ocas" : mode === "gpa" ? "ocas" : "gpa";
                  setMode(nextMode);
                  document.getElementById(`calculator-mode-${nextMode}`)?.focus();
                }}
                className="calculator-mode-option"
              >
                {item.id === "gpa" ? <SchoolIcon className="h-4 w-4" /> : <CalculatorIcon className="h-4 w-4" />}
                {item.label}
              </button>
            );
          })}
        </div>

        {calculatorModes.map((item) => (
          <div
            key={item.id}
            id={`calculator-panel-${item.id}`}
            role="region"
            aria-label={`${item.label} calculator`}
            className="min-w-0"
            hidden={mode !== item.id}
          >
            {item.id === "gpa" ? <GpaCalculatorClient /> : <OcasCalculatorClient />}
          </div>
        ))}
      </div>
    </div>
  );
}
