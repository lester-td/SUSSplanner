import type { buildTimetableImportComparison } from "@/lib/timetable/import-comparison";
import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import type { SemesterRecord, SharedClassIdentifier } from "@/lib/timetable/types";

export function ImportComparison({ comparison, semesters }: {
  comparison: ReturnType<typeof buildTimetableImportComparison>;
  semesters: SemesterRecord[];
})
{
  if (!comparison.hasChanges) return null;
  const label = (selection: SharedClassIdentifier) => `${selection.courseCode} ${selection.groupCode}${selection.originSemesterId === undefined ? ""
    : ` · continuation from ${semesters.find((item) => item.semesterId === selection.originSemesterId)?.semesterName ?? `semester ${selection.originSemesterId}`}`}`;
  // A group replacement is one removal and one addition in this compact view.
  const added = [...comparison.added, ...comparison.changed.map((change) => change.after)];
  const removed = [...comparison.removed, ...comparison.changed.map((change) => change.before)];
  return (
    <div className="space-y-4">
      {([
        ["Added", added],
        ["Removed", removed],
      ] as const).map(([title, selections]) => selections.length > 0 ? (
        <section key={title} aria-label={title}>
          <h3 className="font-semibold text-[var(--on-surface)]">{title} ({selections.length})</h3>
          <ul className="mt-1 space-y-1 text-[var(--on-surface-variant)]">
            {selections.map((selection) => <li className="break-words" key={buildSharedClassIdentifier(selection)}>{label(selection)}</li>)}
          </ul>
        </section>
      ) : null)}
    </div>
  );
}
