"use client";

import { useEffect, useMemo, useState } from "react";

import { PlusIcon } from "@/components/planner/icons";
import {
  STUDY_PLAN_UPDATED_EVENT,
  announceStudyPlanUpdated,
  loadStudyPlanState,
  saveStudyPlanState,
  upsertCatalogCourseInStudyPlan,
} from "@/lib/planner/storage";

type CatalogCourseLike = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  creditUnits: number | null;
};

export function AddToStudyPlanButton({
  course,
  compact = false,
  appearance = "default",
  onAdded,
}: {
  course: CatalogCourseLike;
  compact?: boolean;
  appearance?: "default" | "outline";
  onAdded?: () => void;
})
{
  const [added, setAdded] = useState(false);
  const courseCode = useMemo(() => course.courseCode.trim().toUpperCase(), [course.courseCode]);

  useEffect(() => {
    const syncAddedState = () => {
      const current = loadStudyPlanState();
      setAdded(current?.courses.some((item) => item.courseCode === courseCode) ?? false);
    };

    syncAddedState();
    window.addEventListener("storage", syncAddedState);
    window.addEventListener(STUDY_PLAN_UPDATED_EVENT, syncAddedState);

    return () => {
      window.removeEventListener("storage", syncAddedState);
      window.removeEventListener(STUDY_PLAN_UPDATED_EVENT, syncAddedState);
    };
  }, [courseCode]);

  const buttonClassName = appearance === "outline"
    ? `inline-flex items-center gap-1.5 rounded-[0.4rem] border px-2.5 py-1.5 text-[11px] font-semibold leading-4 transition-colors ${
        added
          ? "border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] text-[var(--primary)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
      }`
    : `inline-flex items-center gap-1.5 rounded-[0.55rem] border px-3 py-2 text-[12px] font-semibold leading-4 transition-colors ${
        added
          ? "border-[var(--brand-divider)] bg-[var(--brand-chip-bg)] text-[var(--primary)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface)] hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
      } ${compact ? "gap-1 px-2 py-0 text-[11px]" : ""}`;

  return (
    <button
      type="button"
      onClick={() => {
        const next = upsertCatalogCourseInStudyPlan(loadStudyPlanState(), course);
        saveStudyPlanState(next);
        announceStudyPlanUpdated();
        setAdded(true);
        onAdded?.();
      }}
      className={buttonClassName}
      aria-label={`Add ${courseCode} to planner`}
    >
      <PlusIcon className="h-4 w-4" />
      {added ? "In Planner" : "Add to Planner"}
    </button>
  );
}
