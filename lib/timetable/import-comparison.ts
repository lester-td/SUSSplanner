import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerStorageState, SharedClassIdentifier } from "./types";

type ImportComparisonSelections = {
  readonly selectedClasses: readonly SharedClassIdentifier[];
  readonly preservedSelections?: readonly SharedClassIdentifier[];
};

export function buildTimetableImportComparison(
  saved: readonly SharedClassIdentifier[],
  proposal: ImportComparisonSelections,
)
{
  const unique = (items: readonly SharedClassIdentifier[]) => [...new Map(items.map((item) => [buildSharedClassIdentifier(item), item])).values()];
  const before = unique(saved);
  const after = unique(proposal.selectedClasses);
  const beforeKeys = new Set(before.map(buildSharedClassIdentifier));
  const afterKeys = new Set(after.map(buildSharedClassIdentifier));
  const added = after.filter((item) => !beforeKeys.has(buildSharedClassIdentifier(item)));
  const removed = before.filter((item) => !afterKeys.has(buildSharedClassIdentifier(item)));
  return { added, removed, hasChanges: added.length + removed.length > 0 };
}

export function buildTimetableImportEffects(current: PlannerStorageState | null, projected: PlannerStorageState)
{
  const semesters = Object.values(projected.semesterStates ?? {}).map((semester) => ({
    semesterId: semester.semesterId,
    comparison: buildTimetableImportComparison(current?.semesterStates?.[String(semester.semesterId)]?.selectedClasses ?? [], semester),
  })).filter((item) => item.comparison.hasChanges);
  const target = current?.semesterStates?.[String(projected.semesterId)];
  return {
    semesters,
    hasChanges: semesters.length > 0,
    resetsView: (target?.hiddenClasses.length ?? 0) > 0 || (target?.selectedWeekId ?? "all") !== "all"
      || (current !== null && current.semesterId !== projected.semesterId),
  };
}
