import type { PlannerSemesterState, SharedClassIdentifier } from "./types";
import { buildSharedClassIdentifier } from "./share-url";

type EnrolmentOwner = {
  readonly courseCode: string;
  readonly originSemesterId: number;
};

export function getEnrolmentOwner(selection: SharedClassIdentifier, semesterId: number): EnrolmentOwner
{
  return { courseCode: selection.courseCode.trim().toUpperCase(), originSemesterId: selection.originSemesterId ?? semesterId };
}

export function isOwnedContinuation(selection: SharedClassIdentifier, owner: EnrolmentOwner)
{
  return selection.courseCode.trim().toUpperCase() === owner.courseCode && selection.originSemesterId === owner.originSemesterId;
}

// Explicit group changes retain existing destinations when publication metadata
// is absent. An explicit [] has a different meaning: no continuation destinations.
export function getContinuationDestinationIds(
  semesterStates: readonly PlannerSemesterState[],
  owner: EnrolmentOwner,
  publishedDestinationIds?: readonly number[],
)
{
  return new Set(publishedDestinationIds === undefined
    ? semesterStates.filter((target) => target.semesterId !== owner.originSemesterId
      && target.selectedClasses.some((item) => isOwnedContinuation(item, owner))).map((target) => target.semesterId)
    : publishedDestinationIds.filter((id) => id !== owner.originSemesterId));
}

// Shared by explicit group changes, whole-enrolment removal, and import
// projection. Callers decide which published destinations are authorised.
export function reconcileOwnedContinuations(
  semesterStates: Readonly<Record<string, PlannerSemesterState>>,
  owner: EnrolmentOwner,
  selection: SharedClassIdentifier | null,
  publishedDestinationIds?: readonly number[],
  mode: "replace" | "restore" = "replace",
)
{
  const result = { ...semesterStates };
  const targetIds = getContinuationDestinationIds(Object.values(result), owner, publishedDestinationIds);
  const linkedSelection = selection ? { ...selection, originSemesterId: owner.originSemesterId } : null;
  for (const [key, target] of Object.entries(result))
  {
    if (target.semesterId === owner.originSemesterId) continue;
    const owned = target.selectedClasses.filter((item) => isOwnedContinuation(item, owner));
    if (mode === "restore")
    {
      if (!linkedSelection || !targetIds.has(target.semesterId)) continue;
      // Restoration is prevalidated by the projection. Never rewrite existing
      // records or their hidden/view metadata, even when they look obsolete.
      if (owned.length === 0)
      {
        result[key] = { ...target, selectedClasses: [...target.selectedClasses, linkedSelection] };
      }
      targetIds.delete(target.semesterId);
      continue;
    }
    if (selection && owned.length === 0 && !targetIds.has(target.semesterId)) continue;
    const ownedKeys = new Set(owned.map(buildSharedClassIdentifier));
    const retainedKey = linkedSelection && targetIds.has(target.semesterId) ? buildSharedClassIdentifier(linkedSelection) : null;
    let retained = false;
    const selectedClasses = target.selectedClasses.flatMap((item) => {
      if (!isOwnedContinuation(item, owner)) return [item];
      if (!retainedKey || retained || !linkedSelection) return [];
      retained = true;
      return [linkedSelection];
    });
    if (retainedKey && !retained && linkedSelection) selectedClasses.push(linkedSelection);
    const validKeys = new Set(selectedClasses.map(buildSharedClassIdentifier));
    result[key] = {
      ...target,
      selectedClasses,
      hiddenClasses: target.hiddenClasses.filter((shareKey) => selection
        ? !ownedKeys.has(shareKey) || shareKey === retainedKey : validKeys.has(shareKey)),
    };
    targetIds.delete(target.semesterId);
  }
  for (const targetId of targetIds)
  {
    if (!linkedSelection) continue;
    result[String(targetId)] = {
      semesterId: targetId, selectedClasses: [linkedSelection], hiddenClasses: [],
      courseColorsByCourseCode: {}, selectedWeekId: "all",
    };
  }
  return result;
}
