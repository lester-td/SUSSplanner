import { plannerSemesterStateSchema, plannerStorageStateSchema } from "@/lib/validation/timetable";
import type { PlannerSemesterState, PlannerStorageState, SharedTimetableState } from "./types";

export const TIMETABLE_STORAGE_KEY = "sussplanner.timetable.v1";

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeSemesterState(state: PlannerSemesterState)
{
  return plannerSemesterStateSchema.parse(state);
}

function appendSemesterState(
  target: Map<string, PlannerSemesterState>,
  state: PlannerSemesterState,
)
{
  const normalized = normalizeSemesterState(state);
  target.set(String(normalized.semesterId), normalized);
}

function normalizeStorageState(state: PlannerStorageState)
{
  const parsed = plannerStorageStateSchema.parse(state);
  const semesterStates = new Map<string, PlannerSemesterState>();

  for (const semesterState of Object.values(parsed.semesterStates ?? {}))
  {
    appendSemesterState(semesterStates, semesterState);
  }

  const activeSemesterState = semesterStates.get(String(parsed.semesterId))
    ?? normalizeSemesterState({
      semesterId: parsed.semesterId,
      selectedClasses: parsed.selectedClasses,
      hiddenClasses: parsed.hiddenClasses,
      courseColorsByCourseCode: parsed.courseColorsByCourseCode,
      selectedWeekId: parsed.selectedWeekId,
    });

  semesterStates.set(String(activeSemesterState.semesterId), activeSemesterState);

  return {
    semesterId: activeSemesterState.semesterId,
    selectedClasses: activeSemesterState.selectedClasses,
    hiddenClasses: activeSemesterState.hiddenClasses,
    courseColorsByCourseCode: activeSemesterState.courseColorsByCourseCode,
    selectedWeekId: activeSemesterState.selectedWeekId,
    orientation: parsed.orientation,
    viewMode: parsed.viewMode,
    semesterStates: Object.fromEntries(semesterStates),
  } satisfies PlannerStorageState;
}

function mergeStorageState(existing: PlannerStorageState | null, next: PlannerStorageState)
{
  const parsedNext = plannerStorageStateSchema.parse(next);
  const semesterStates = new Map<string, PlannerSemesterState>();

  for (const semesterState of Object.values(existing?.semesterStates ?? {}))
  {
    appendSemesterState(semesterStates, semesterState);
  }

  for (const semesterState of Object.values(parsedNext.semesterStates ?? {}))
  {
    appendSemesterState(semesterStates, semesterState);
  }

  const activeSemesterState = normalizeSemesterState({
    semesterId: parsedNext.semesterId,
    selectedClasses: parsedNext.selectedClasses,
    hiddenClasses: parsedNext.hiddenClasses,
    courseColorsByCourseCode: parsedNext.courseColorsByCourseCode,
    selectedWeekId: parsedNext.selectedWeekId,
  });
  semesterStates.set(String(activeSemesterState.semesterId), activeSemesterState);

  return normalizeStorageState({
    semesterId: parsedNext.semesterId,
    selectedClasses: activeSemesterState.selectedClasses,
    hiddenClasses: activeSemesterState.hiddenClasses,
    courseColorsByCourseCode: activeSemesterState.courseColorsByCourseCode,
    selectedWeekId: activeSemesterState.selectedWeekId,
    orientation: parsedNext.orientation,
    viewMode: parsedNext.viewMode,
    semesterStates: Object.fromEntries(semesterStates),
  });
}

export function getSavedSemesterState(state: PlannerStorageState | null, semesterId: number)
{
  if (!state)
  {
    return null;
  }

  return state.semesterStates?.[String(semesterId)] ?? null;
}

export function loadSavedTimetable()
{
  if (!canUseLocalStorage())
  {
    return null;
  }

  const raw = window.localStorage.getItem(TIMETABLE_STORAGE_KEY);
  if (!raw)
  {
    return null;
  }

  try
  {
    return normalizeStorageState(plannerStorageStateSchema.parse(JSON.parse(raw)) as PlannerStorageState);
  }
  catch
  {
    return null;
  }
}

export function saveTimetableToLocalStorage(state: PlannerStorageState)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  const parsed = mergeStorageState(loadSavedTimetable(), state);
  window.localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(parsed));
}

export function clearSavedTimetable()
{
  if (!canUseLocalStorage())
  {
    return;
  }

  window.localStorage.removeItem(TIMETABLE_STORAGE_KEY);
}

export function importSharedTimetableToLocalStorage(
  state: SharedTimetableState,
  current?: PlannerStorageState | null,
)
{
  const currentTargetState = getSavedSemesterState(current ?? null, state.semesterId);
  const nextSemesterState: PlannerSemesterState = {
    semesterId: state.semesterId,
    selectedClasses: state.selectedClasses,
    hiddenClasses: [],
    courseColorsByCourseCode: currentTargetState?.courseColorsByCourseCode ?? {},
    selectedWeekId: "all",
  };

  const nextState: PlannerStorageState = {
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

  saveTimetableToLocalStorage(nextState);
  return nextState;
}
