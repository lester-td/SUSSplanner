import { buildSharedClassIdentifier } from "./share-url";
import type { SharedClassIdentifier } from "./types";

type ImportComparisonSelections = {
  readonly selectedClasses: readonly SharedClassIdentifier[];
  readonly preservedSelections: readonly SharedClassIdentifier[];
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
  const preservedKeys = new Set(proposal.preservedSelections.map(buildSharedClassIdentifier));
  const preserved = before.filter((item) => afterKeys.has(buildSharedClassIdentifier(item)) && preservedKeys.has(buildSharedClassIdentifier(item)));
  const unchanged = before.filter((item) => afterKeys.has(buildSharedClassIdentifier(item)) && !preservedKeys.has(buildSharedClassIdentifier(item)));
  const changed: { before: SharedClassIdentifier; after: SharedClassIdentifier }[] = [];
  const sameEnrollment = (a: SharedClassIdentifier, b: SharedClassIdentifier) => (
    a.courseCode === b.courseCode && a.originSemesterId === b.originSemesterId
  );
  for (const previous of [...removed])
  {
    const replacements = added.filter((item) => sameEnrollment(previous, item));
    // Only pair an unambiguous course/intake identity. Never conflate an
    // independent start with a continuation or guess between multiple groups.
    if (replacements.length !== 1 || before.filter((item) => sameEnrollment(previous, item)).length !== 1
      || after.filter((item) => sameEnrollment(previous, item)).length !== 1) continue;
    const replacement = replacements[0];
    changed.push({ before: previous, after: replacement });
    removed.splice(removed.indexOf(previous), 1);
    added.splice(added.indexOf(replacement), 1);
  }
  return { added, removed, changed, preserved, unchanged, hasChanges: added.length + removed.length + changed.length > 0 };
}
