import { SchoolIcon } from "@/components/planner/icons";
import { GRADE_BANDS, GRADE_POINT_VALUES, formatGradeRange } from "@/lib/calculator/grade-scale";

export function SussGradeScale()
{
  return (
    <section className="app-aero-panel calculator-panel calculator-nested-panel overflow-hidden">
      <div className="app-aero-panel-heading calculator-panel-heading">
        <SchoolIcon className="h-5 w-5 shrink-0 text-[var(--primary)]" />
        <h2 className="text-[15px] font-bold text-[var(--on-surface)]">Grade Scale</h2>
      </div>
      <div className="calculator-panel-body grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 p-4 text-[12px] sm:p-5">
        <span className="font-semibold text-[var(--on-surface-variant)]">Grade</span>
        <span className="font-semibold text-[var(--on-surface-variant)]">Mark</span>
        <span className="text-right font-semibold text-[var(--on-surface-variant)]">GPV</span>
        {GRADE_BANDS.map((band, index) => (
          <div key={band.grade} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="font-semibold text-[var(--on-surface)]">{band.grade}</span>
            <span className="text-[var(--on-surface-variant)]">{formatGradeRange(index)}</span>
            <span className="text-right text-[var(--on-surface-variant)]">
              {GRADE_POINT_VALUES[band.grade].toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
