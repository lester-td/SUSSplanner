import {
  getSavedSemesterState,
  importSharedTimetableToLocalStorage,
  loadSavedTimetable,
} from "./local-storage";
import { buildSharedClassIdentifier } from "./share-url";
import { projectTimetableImport } from "./import-projection";
import { MAX_TIMETABLE_SELECTIONS } from "./limits";
import type { PlannerStorageState, SharedClassIdentifier, SharedTimetableState, TimetableData } from "./types";

export type SkippedImportSelection = {
  selection: SharedClassIdentifier;
  reason: "unresolved" | "conflict";
  savedOrigin?: SharedClassIdentifier;
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
  const preservedSelections: SharedClassIdentifier[] = [];
  const seen = new Set<string>();
  let eligibleIncomingCount = 0;

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
    preservedSelections.push(selection);
    if (!selectedClasses.some((item) => item.courseCode === selection.courseCode
      && item.originSemesterId === selection.originSemesterId)) selectedClasses.push(selection);
  }

  return {
    selectedClasses,
    preservedSelections,
    skipped,
    projectedState: projectTimetableImport({ semesterId: incoming.semesterId, selectedClasses }, current),
    canImport: eligibleIncomingCount > 0 && selectedClasses.length <= MAX_TIMETABLE_SELECTIONS,
    tooManySelections: selectedClasses.length > MAX_TIMETABLE_SELECTIONS,
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
  importSharedTimetableToLocalStorage({ semesterId, selectedClasses: proposal.selectedClasses }, current);
  return true;
}
