import { getEnrolmentOwner, reconcileOwnedContinuations } from "./continuation-ownership";
import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerSemesterState, PlannerStorageState, SharedTimetableState } from "./types";

export type ImportProjectionOptions = {
  // Missing metadata is deliberately [] for explicit imports, never a fallback
  // to the old enrolment's destinations.
  continuationDestinations?: ReadonlyMap<string, readonly number[]>;
  retainedStarts?: ReadonlySet<string>;
};

export function projectTimetableImport(
  state: SharedTimetableState,
  current: PlannerStorageState | null = null,
  { continuationDestinations = new Map(), retainedStarts = new Set() }: ImportProjectionOptions = {},
): PlannerStorageState
{
  const currentTargetState = current?.semesterStates?.[String(state.semesterId)];
  const nextSemesterState: PlannerSemesterState = {
    semesterId: state.semesterId,
    selectedClasses: state.selectedClasses,
    hiddenClasses: [],
    courseColorsByCourseCode: currentTargetState?.courseColorsByCourseCode ?? {},
    selectedWeekId: "all",
  };
  let semesterStates = {
    ...(current?.semesterStates ?? {}),
    [String(state.semesterId)]: nextSemesterState,
  };
  const starts = state.selectedClasses.filter((item) => item.originSemesterId === undefined);
  const startCourses = new Set(starts.map((item) => item.courseCode));
  for (const previous of currentTargetState?.selectedClasses ?? [])
  {
    if (previous.originSemesterId !== undefined || startCourses.has(previous.courseCode)) continue;
    semesterStates = reconcileOwnedContinuations(semesterStates, getEnrolmentOwner(previous, state.semesterId), previous, []);
  }
  for (const start of starts)
  {
    const key = buildSharedClassIdentifier(start);
    if (retainedStarts.has(key)) continue;
    semesterStates = reconcileOwnedContinuations(semesterStates, getEnrolmentOwner(start, state.semesterId), start,
      continuationDestinations.get(key) ?? []);
  }

  return {
    ...nextSemesterState,
    orientation: current?.orientation ?? "horizontal",
    viewMode: current?.viewMode ?? "class",
    semesterStates,
  };
}
