import {
  getSavedSemesterState,
  getContinuationConflicts,
  importSharedTimetableToLocalStorage,
  loadSavedTimetable,
} from "./local-storage";
import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerStorageState, SharedClassIdentifier, SharedTimetableState, TimetableData } from "./types";

export type SkippedImportSelection = {
  selection: SharedClassIdentifier;
  reason: "unresolved" | "conflict";
  savedOrigin?: SharedClassIdentifier;
  conflictSemesterId?: number;
};

export function buildTimetableImportProposal({
  incoming,
  current,
  incomingTimetable,
  savedTimetable,
}: {
  incoming: SharedTimetableState;
  current: PlannerStorageState | null;
  incomingTimetable: TimetableData;
  savedTimetable: TimetableData | null;
})
{
  const validIncoming = new Set(incomingTimetable.selections.map((item) => buildSharedClassIdentifier(item.identifier)));
  const validSaved = new Set(savedTimetable?.selections.map((item) => buildSharedClassIdentifier(item.identifier)) ?? []);
  const selectedClasses: SharedClassIdentifier[] = [];
  const skipped: SkippedImportSelection[] = [];
  const seen = new Set<string>();
  let eligibleIncomingCount = 0;
  const resolvedStarts = incomingTimetable.selections.filter((item) => item.identifier.originSemesterId === undefined);

  for (const selection of incoming.selectedClasses)
  {
    const key = buildSharedClassIdentifier(selection);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!validIncoming.has(key))
    {
      skipped.push({ selection, reason: "unresolved" });
      continue;
    }

    const resolved = resolvedStarts.find((item) => buildSharedClassIdentifier(item.identifier) === key);
    const conflictSemesterId = resolved ? getContinuationConflicts(current, incoming.semesterId, resolved)[0] : undefined;
    if (conflictSemesterId !== undefined)
    {
      skipped.push({ selection, reason: "conflict", conflictSemesterId });
      continue;
    }

    const savedOrigin = selection.originSemesterId === undefined ? undefined
      : getSavedSemesterState(current, selection.originSemesterId)?.selectedClasses.find((item) => (
        item.courseCode === selection.courseCode && item.originSemesterId === undefined
      ));
    if (savedOrigin && (
      savedOrigin.scheduleType !== selection.scheduleType
      || savedOrigin.groupCodeType !== selection.groupCodeType
      || savedOrigin.groupCode !== selection.groupCode
    ))
    {
      skipped.push({ selection, reason: "conflict", savedOrigin });
      continue;
    }
    selectedClasses.push(selection);
    eligibleIncomingCount += 1;
  }

  // A target-semester import replaces ordinary selections, but a valid link
  // owned by a saved start in another semester remains part of that enrollment.
  for (const selection of getSavedSemesterState(current, incoming.semesterId)?.selectedClasses ?? [])
  {
    if (selection.originSemesterId === undefined) continue;
    const key = buildSharedClassIdentifier(selection);
    const origin = getSavedSemesterState(current, selection.originSemesterId)?.selectedClasses.find((item) => (
      item.courseCode === selection.courseCode && item.originSemesterId === undefined
    ));
    if (!validSaved.has(key) || !origin
      || origin.scheduleType !== selection.scheduleType
      || origin.groupCodeType !== selection.groupCodeType
      || origin.groupCode !== selection.groupCode) continue;
    if (!selectedClasses.some((item) => item.courseCode === selection.courseCode
      && item.originSemesterId === selection.originSemesterId)) selectedClasses.push(selection);
  }

  return {
    selectedClasses,
    resolvedStarts: resolvedStarts.filter((item) => selectedClasses.some((selection) => buildSharedClassIdentifier(selection) === buildSharedClassIdentifier(item.identifier))),
    skipped,
    canImport: eligibleIncomingCount > 0 && selectedClasses.length <= 50,
    tooManySelections: selectedClasses.length > 50,
  };
}

export function commitTimetableImport({
  semesterId,
  proposal,
  expectedSavedState,
}: {
  semesterId: number;
  proposal: ReturnType<typeof buildTimetableImportProposal>;
  expectedSavedState: string;
})
{
  if (!proposal.canImport) return false;
  const current = loadSavedTimetable();
  if (JSON.stringify(current) !== expectedSavedState) return false;
  importSharedTimetableToLocalStorage({ semesterId, selectedClasses: proposal.selectedClasses }, current, proposal.resolvedStarts);
  return true;
}
