import type { PlannerSemesterState, PlannerStorageState, SharedTimetableState } from "./types";

// Callers supply the effective selections, including any validated kept links.
// Importing replaces only the target semester; it does not reconcile continuations.
export function projectTimetableImport(
  state: SharedTimetableState,
  current: PlannerStorageState | null = null,
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

  return {
    semesterId: nextSemesterState.semesterId,
    selectedClasses: nextSemesterState.selectedClasses,
    hiddenClasses: nextSemesterState.hiddenClasses,
    courseColorsByCourseCode: nextSemesterState.courseColorsByCourseCode,
    selectedWeekId: nextSemesterState.selectedWeekId,
    orientation: current?.orientation ?? "horizontal",
    viewMode: current?.viewMode ?? "class",
    semesterStates: {
      ...(current?.semesterStates ?? {}),
      [String(nextSemesterState.semesterId)]: nextSemesterState,
    },
  };
}
