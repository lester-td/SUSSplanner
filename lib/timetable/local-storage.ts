import { plannerSemesterStateSchema, plannerStorageStateSchema } from "@/lib/validation/timetable";
import type { PlannerSemesterState, PlannerStorageState, SharedClassIdentifier, SharedTimetableState } from "./types";
import { buildSharedClassIdentifier } from "./share-url";

export const TIMETABLE_STORAGE_KEY = "sussplanner.timetable.v1";
export const TIMETABLE_UPDATED_EVENT = "sussplanner:timetable-updated";

const DEFAULT_ORIENTATION = "horizontal";
const DEFAULT_VIEW_MODE = "class";

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeCourseCode(courseCode: string)
{
  return courseCode.trim().toUpperCase();
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

  // A continuation belongs to its starting semester. Keep its group in sync
  // without touching a separate start of the same course in the target semester.
  for (const [key, semesterState] of semesterStates)
  {
    if (semesterState.semesterId === activeSemesterState.semesterId) continue;
    const selectedClasses = semesterState.selectedClasses.flatMap((selection) => {
      if (selection.originSemesterId !== activeSemesterState.semesterId) return [selection];
      const origin = activeSemesterState.selectedClasses.find((item) => (
        item.courseCode === selection.courseCode && item.originSemesterId === undefined
      ));
      return origin ? [{ ...origin, originSemesterId: activeSemesterState.semesterId }] : [];
    });
    const validKeys = new Set(selectedClasses.map(buildSharedClassIdentifier));
    semesterStates.set(key, {
      ...semesterState,
      selectedClasses,
      hiddenClasses: semesterState.hiddenClasses.filter((shareKey) => validKeys.has(shareKey)),
    });
  }

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

export function announceTimetableUpdated()
{
  if (typeof window === "undefined")
  {
    return;
  }

  window.dispatchEvent(new CustomEvent(TIMETABLE_UPDATED_EVENT));
}

function createEmptyTimetableState(semesterId: number): PlannerStorageState
{
  return {
    semesterId,
    selectedClasses: [],
    hiddenClasses: [],
    courseColorsByCourseCode: {},
    selectedWeekId: "all",
    orientation: DEFAULT_ORIENTATION,
    viewMode: DEFAULT_VIEW_MODE,
  };
}

function getTimetableStateForSemester(
  state: PlannerStorageState | null,
  semesterId: number,
): PlannerStorageState
{
  const semesterState = getSavedSemesterState(state, semesterId);

  return {
    semesterId,
    selectedClasses: semesterState?.selectedClasses ?? [],
    hiddenClasses: semesterState?.hiddenClasses ?? [],
    courseColorsByCourseCode: semesterState?.courseColorsByCourseCode ?? {},
    selectedWeekId: semesterState?.selectedWeekId ?? "all",
    orientation: state?.orientation ?? DEFAULT_ORIENTATION,
    viewMode: state?.viewMode ?? DEFAULT_VIEW_MODE,
    semesterStates: state?.semesterStates ?? {},
  };
}

export function isCourseInTimetable(
  state: PlannerStorageState | null,
  semesterId: number,
  courseCode: string,
)
{
  const normalizedCode = normalizeCourseCode(courseCode);
  const semesterState = getSavedSemesterState(state, semesterId);

  return semesterState?.selectedClasses.some((selection) => (
    selection.courseCode === normalizedCode && selection.originSemesterId === undefined
  )) ?? false;
}

export function upsertClassInSavedTimetable(
  state: PlannerStorageState | null,
  semesterId: number,
  selection: SharedTimetableState["selectedClasses"][number],
  continuationSemesterIds: number[] = [],
)
{
  const base = state ? getTimetableStateForSemester(state, semesterId) : createEmptyTimetableState(semesterId);
  const normalizedSelection = {
    ...selection,
    courseCode: normalizeCourseCode(selection.courseCode),
  };
  const nextSemesterState: PlannerSemesterState = {
    semesterId,
    selectedClasses: [
      ...base.selectedClasses.filter((item) => (
        item.courseCode !== normalizedSelection.courseCode
        || item.originSemesterId !== normalizedSelection.originSemesterId
      )),
      normalizedSelection,
    ],
    hiddenClasses: base.hiddenClasses.filter((shareKey) => !base.selectedClasses.some((item) => (
      item.courseCode === normalizedSelection.courseCode
      && item.originSemesterId === normalizedSelection.originSemesterId
      && buildSharedClassIdentifier(item) === shareKey
    ))),
    courseColorsByCourseCode: base.courseColorsByCourseCode,
    selectedWeekId: base.selectedWeekId,
  };

  const semesterStates = {
    ...(state?.semesterStates ?? {}),
    [String(semesterId)]: nextSemesterState,
  };
  if (normalizedSelection.originSemesterId === undefined)
  {
    for (const targetId of continuationSemesterIds.filter((id) => id !== semesterId))
    {
      const target = semesterStates[String(targetId)] ?? {
        semesterId: targetId,
        selectedClasses: [],
        hiddenClasses: [],
        courseColorsByCourseCode: {},
        selectedWeekId: "all" as const,
      };
      semesterStates[String(targetId)] = {
        ...target,
        selectedClasses: [
          ...target.selectedClasses.filter((item) => (
            item.courseCode !== normalizedSelection.courseCode || item.originSemesterId !== semesterId
          )),
          { ...normalizedSelection, originSemesterId: semesterId },
        ],
      };
    }
  }

  return normalizeStorageState({
    ...base,
    ...nextSemesterState,
    semesterStates,
  });
}

export function removeCourseCodeFromSavedTimetable(
  state: PlannerStorageState | null,
  semesterId: number,
  courseCode: string,
)
{
  const base = state ? getTimetableStateForSemester(state, semesterId) : createEmptyTimetableState(semesterId);
  const normalizedCode = normalizeCourseCode(courseCode);
  const nextSemesterState: PlannerSemesterState = {
    semesterId,
    selectedClasses: base.selectedClasses.filter((selection) => (
      selection.courseCode !== normalizedCode || selection.originSemesterId !== undefined
    )),
    hiddenClasses: base.hiddenClasses.filter((shareKey) => !base.selectedClasses.some((item) => (
      item.courseCode === normalizedCode && item.originSemesterId === undefined
      && buildSharedClassIdentifier(item) === shareKey
    ))),
    courseColorsByCourseCode: base.courseColorsByCourseCode,
    selectedWeekId: base.selectedWeekId,
  };

  return normalizeStorageState({
    ...base,
    ...nextSemesterState,
    semesterStates: {
      ...(state?.semesterStates ?? {}),
      [String(semesterId)]: nextSemesterState,
    },
  });
}

export function removeClassFromSavedTimetable(
  state: PlannerStorageState | null,
  semesterId: number,
  selection: SharedClassIdentifier,
)
{
  const originId = selection.originSemesterId ?? semesterId;
  const next = removeCourseCodeFromSavedTimetable(state, originId, selection.courseCode);
  // Remove the whole linked enrollment, but keep the semester being viewed.
  return normalizeStorageState(getTimetableStateForSemester(next, semesterId));
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
