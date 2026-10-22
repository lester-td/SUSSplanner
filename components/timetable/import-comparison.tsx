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
    <div className="space-y-4">
      {!comparison.hasChanges ? <p role="status">No class changes will be made.</p> : null}
      {([
        ["Added", comparison.added],
        ["Removed", comparison.removed],
        ["Kept", comparison.preserved],
      ] as const).map(([title, selections]) => selections.length > 0 ? (
        <section key={title} aria-label={title}>
          <h3 className="font-semibold text-[var(--on-surface)]">{title} ({selections.length})</h3>
          <ul className="mt-1 space-y-1 text-[var(--on-surface-variant)]">
            {selections.map((selection) => <li className="break-words" key={buildSharedClassIdentifier(selection)}>{label(selection)}</li>)}
          </ul>
        </section>
      ) : null)}
      {comparison.changed.length > 0 ? (
        <section aria-label="Changed">
          <h3 className="font-semibold text-[var(--on-surface)]">Changed ({comparison.changed.length})</h3>
          <ul className="mt-1 space-y-1 text-[var(--on-surface-variant)]">
            {comparison.changed.map((change) => <li className="break-words" key={buildSharedClassIdentifier(change.before)}>{label(change.before)} → {label(change.after)}</li>)}
          </ul>
        </section>
      ) : null}
      {comparison.unchanged.length > 0 ? <p className="text-[var(--on-surface-variant)]">{comparison.unchanged.length} other {comparison.unchanged.length === 1 ? "class remains" : "classes remain"} unchanged.</p> : null}
    </div>
  );
}
