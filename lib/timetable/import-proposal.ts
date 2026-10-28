import {
  getSavedSemesterState,
  saveTimetableImportProjection,
} from "./local-storage";
import { buildSharedClassIdentifier } from "./share-url";
import { getImportEnrolmentKey, getTimetableImportGroups } from "./import-ambiguities";
import { getVerifiedContinuationDestinations, projectTimetableImport } from "./import-projection";
import { MAX_TIMETABLE_SELECTIONS } from "./limits";
import type { PlannerStorageState, SharedClassIdentifier, SharedTimetableState, TimetableData } from "./types";

export type SkippedImportSelection = {
  selection: SharedClassIdentifier;
  reason: "unresolved" | "conflict" | "capacity" | "ambiguous";
  savedOrigin?: SharedClassIdentifier;
};

export function buildTimetableImportProposal({
  incoming,
  current,
  incomingTimetable,
  savedTimetable,
  continuationTimetables = new Map(),
}: {
  incoming: SharedTimetableState;
  current: PlannerStorageState | null;
  incomingTimetable: TimetableData;
  savedTimetable: TimetableData | null;
  continuationTimetables?: ReadonlyMap<number, TimetableData>;
})
{
  const keyOf = buildSharedClassIdentifier;
  const ownerKey = (selection: SharedClassIdentifier) => getImportEnrolmentKey(selection, incoming.semesterId);
  const groups = getTimetableImportGroups(incoming);
  const uniqueIncoming = [...new Map(incoming.selectedClasses.map((item) => [keyOf(item), item])).values()];
  const resolved = new Map(incomingTimetable.selections.map((item) => [keyOf(item.identifier), item]));
  const validSaved = new Set(savedTimetable?.selections.map((item) => keyOf(item.identifier)) ?? []);
  const savedSelections = getSavedSemesterState(current, incoming.semesterId)?.selectedClasses ?? [];
  const rejected = new Map<string, SkippedImportSelection>();
  const destinations = new Map<string, number[]>();
  const unverifiedContinuations: SharedClassIdentifier[] = [];

  // Record incoming intent before rejecting anything. A failed attempt restores
  // its old enrolment; only courses absent from this intent are omissions.
  for (const selection of uniqueIncoming)
  {
    const key = keyOf(selection);
    if (groups.get(ownerKey(selection))!.length > 1)
    {
      rejected.set(key, { selection, reason: "ambiguous" });
      continue;
    }
    if (!resolved.has(key))
    {
      rejected.set(key, { selection, reason: "unresolved" });
      continue;
    }
    const savedOrigin = selection.originSemesterId === undefined ? undefined
      : getSavedSemesterState(current, selection.originSemesterId)?.selectedClasses.find((item) => (
        item.courseCode === selection.courseCode && item.originSemesterId === undefined
      ));
    if (savedOrigin && keyOf({ ...savedOrigin, originSemesterId: selection.originSemesterId }) !== key)
    {
      rejected.set(key, { selection, reason: "conflict", savedOrigin });
      continue;
    }
    if (selection.originSemesterId !== undefined) continue;
    const published = resolved.get(key)!.continuationSemesterIds;
    const { verified, complete } = getVerifiedContinuationDestinations(selection, incoming.semesterId, published, continuationTimetables);
    if (!complete) unverifiedContinuations.push(selection);
    destinations.set(key, verified);
  }

  // Keep valid continuations owned by another saved start when importing their
  // destination semester. Originless links remain ordinary replacement inputs.
  const preservedSelections = savedSelections.filter((selection) => {
    if (selection.originSemesterId === undefined || !validSaved.has(keyOf(selection))) return false;
    const origin = getSavedSemesterState(current, selection.originSemesterId)?.selectedClasses.find((item) => (
      item.courseCode === selection.courseCode && item.originSemesterId === undefined
    ));
    return origin && keyOf({ ...origin, originSemesterId: selection.originSemesterId }) === keyOf(selection);
  });

  const project = () => {
    const accepted = uniqueIncoming.filter((item) => !rejected.has(keyOf(item)));
    const failedOwners = new Set([...rejected.values()].map((item) => ownerKey(item.selection)));
    const retained = savedSelections.filter((item) => item.originSemesterId === undefined && failedOwners.has(ownerKey(item)));
    const selectedClasses = [...new Map([...accepted, ...preservedSelections, ...retained].map((item) => [keyOf(item), item])).values()];
    return projectTimetableImport({ semesterId: incoming.semesterId, selectedClasses }, current, {
      continuationDestinations: destinations,
      retainedStarts: new Set(retained.filter((item) => item.originSemesterId === undefined).map(keyOf)),
    });
  };

  // Rejections are monotonic and bounded by the input size. Reject every
  // contributor to an overfull destination, then recompute with old enrolments
  // restored; URL order cannot choose a capacity winner.
  let projectedState = project();
  for (let round = 0; round < uniqueIncoming.length; round += 1)
  {
    const overfull = Object.values(projectedState.semesterStates ?? {})
      .filter((item) => item.selectedClasses.length > MAX_TIMETABLE_SELECTIONS);
    if (overfull.length === 0) break;
    const contributors = uniqueIncoming.filter((selection) => {
      if (rejected.has(keyOf(selection))) return false;
      const affectedIds = [incoming.semesterId, ...(destinations.get(keyOf(selection)) ?? [])];
      return overfull.some((semester) => affectedIds.includes(semester.semesterId));
    });
    if (contributors.length === 0) break;
    for (const selection of contributors) rejected.set(keyOf(selection), { selection, reason: "capacity" });
    projectedState = project();
  }
  const skipped = uniqueIncoming.flatMap((item) => rejected.has(keyOf(item)) ? [rejected.get(keyOf(item))!] : []);
  const selectedClasses = projectedState.selectedClasses;
  return {
    selectedClasses,
    preservedSelections,
    skipped,
    unverifiedContinuations: unverifiedContinuations.filter((item) => !rejected.has(keyOf(item))),
    projectedState,
    canImport: uniqueIncoming.some((item) => !rejected.has(keyOf(item)))
      && Object.values(projectedState.semesterStates ?? {}).every((item) => item.selectedClasses.length <= MAX_TIMETABLE_SELECTIONS),
    tooManySelections: skipped.some((item) => item.reason === "capacity"),
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
  if (!proposal.canImport || proposal.projectedState.semesterId !== semesterId) return false;
  return saveTimetableImportProjection(proposal.projectedState, expectedSavedState);
}
