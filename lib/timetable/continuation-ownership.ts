import type { PlannerSemesterState, SharedClassIdentifier } from "./types";

type EnrolmentOwner = {
  readonly courseCode: string;
  readonly originSemesterId: number;
};

export function getEnrolmentOwner(selection: SharedClassIdentifier, semesterId: number): EnrolmentOwner
{
  return { courseCode: selection.courseCode, originSemesterId: selection.originSemesterId ?? semesterId };
}

export function isOwnedContinuation(selection: SharedClassIdentifier, owner: EnrolmentOwner)
{
  return selection.courseCode === owner.courseCode && selection.originSemesterId === owner.originSemesterId;
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
