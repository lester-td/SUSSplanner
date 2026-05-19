import { plannerStorageStateSchema } from "@/lib/validation/timetable";
import type { PlannerStorageState, SharedTimetableState } from "./types";

export const TIMETABLE_STORAGE_KEY = "sussplanner.timetable.v1";

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    return plannerStorageStateSchema.parse(JSON.parse(raw)) as PlannerStorageState;
  }
  catch {
    return null;
  }
}

export function saveTimetableToLocalStorage(state: PlannerStorageState)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  const parsed = plannerStorageStateSchema.parse(state);
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
  const nextState: PlannerStorageState = {
    semesterId: state.semesterId,
    selectedClasses: state.selectedClasses,
    hiddenClasses: [],
    selectedWeekId: "all",
    orientation: current?.orientation ?? "horizontal",
    viewMode: current?.viewMode ?? "class",
  };

  saveTimetableToLocalStorage(nextState);
  return nextState;
}
