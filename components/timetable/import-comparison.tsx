import type { buildTimetableImportComparison } from "@/lib/timetable/import-comparison";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import type { SemesterRecord, SharedClassIdentifier } from "@/lib/timetable/types";

export function ImportComparison({ comparison, semesters }: {
  comparison: ReturnType<typeof buildTimetableImportComparison>;
  semesters: SemesterRecord[];
})
{
  const label = (selection: SharedClassIdentifier) => `${selection.courseCode} ${selection.groupCode}${selection.originSemesterId === undefined ? ""
    : ` · continuation from ${semesters.find((item) => item.semesterId === selection.originSemesterId)?.semesterName ?? `semester ${selection.originSemesterId}`}`}`;
  return (
    <div className="space-y-3">
      {([
        ["Added", comparison.added],
        ["Removed", comparison.removed],
      ] as const).map(([title, selections]) => selections.length > 0 ? (
        <section key={title} aria-label={title}>
          <h4 className="font-semibold text-[var(--on-surface)]">{title} ({selections.length})</h4>
          <ul className="mt-1 space-y-1 text-[var(--on-surface-variant)]">
            {selections.map((selection) => <li className="break-words" key={buildSharedClassIdentifier(selection)}>{label(selection)}</li>)}
          </ul>
        </section>
      ) : null)}
    </div>
  );
}
