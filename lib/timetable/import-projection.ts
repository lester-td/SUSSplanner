import { getEnrolmentOwner, isOwnedContinuation, reconcileOwnedContinuations } from "./continuation-ownership";
import { MAX_TIMETABLE_SELECTIONS } from "./limits";
import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerSemesterState, PlannerStorageState, SharedClassIdentifier, SharedTimetableState, TimetableData } from "./types";

export function getVerifiedContinuationDestinations(
  selection: SharedClassIdentifier,
  semesterId: number,
  published: readonly number[] | undefined,
  continuationTimetables: ReadonlyMap<number, TimetableData>,
)
{
  const required = [...new Set(published ?? [])].filter((id) => id !== semesterId);
  const key = buildSharedClassIdentifier({ ...selection, originSemesterId: semesterId });
  const verified = required.filter((id) => continuationTimetables.get(id)?.selections.some((item) => (
    buildSharedClassIdentifier(item.identifier) === key
  )));
  return { verified, complete: published !== undefined && verified.length === required.length };
}

// Same ownership and mutation infrastructure as explicit imports, with strictly
// add-only authority. Current saved starts, not resolved rows, define candidates.
export function projectMissingContinuations(
  current: PlannerStorageState,
  semesterId: number,
  timetable: TimetableData,
  continuationTimetables: ReadonlyMap<number, TimetableData>,
)
{
  const keyOf = buildSharedClassIdentifier;
  if (timetable.semester?.semesterId !== semesterId) return { projectedState: current, changed: false, skipped: [] };
  const semesterStates = current.semesterStates ?? { [String(current.semesterId)]: current };
  const saved = semesterStates[String(semesterId)]?.selectedClasses ?? [];
  const resolved = new Map(timetable.selections.map((item) => [keyOf(item.identifier), item]));
  const skipped: { selection: SharedClassIdentifier; reason: "ambiguous" | "conflict" | "capacity" }[] = [];
  const candidates: { selection: SharedClassIdentifier; missing: number[] }[] = [];
  const uniqueStarts = [...new Map(saved.filter((item) => item.originSemesterId === undefined).map((item) => [keyOf(item), item])).values()];
  for (const selection of uniqueStarts)
  {
    const owner = getEnrolmentOwner(selection, semesterId);
    if (uniqueStarts.filter((item) => getEnrolmentOwner(item, semesterId).courseCode === owner.courseCode).length > 1)
    {
      skipped.push({ selection, reason: "ambiguous" });
      continue;
    }
    const published = resolved.get(keyOf(selection));
    if (!published || published.identifier.originSemesterId !== undefined) continue;
    const { verified, complete } = getVerifiedContinuationDestinations(selection, semesterId,
      published.continuationSemesterIds, continuationTimetables);
    if (!complete || verified.length === 0) continue;
    const linkedKey = keyOf({ ...selection, originSemesterId: semesterId });
    const inconsistent = Object.values(semesterStates).some((target) => target.semesterId !== semesterId
      && target.selectedClasses.some((item) => isOwnedContinuation(item, owner) && keyOf(item) !== linkedKey));
    const missing = verified.filter((id) => !semesterStates[String(id)]?.selectedClasses.some((item) => keyOf(item) === linkedKey));
    if (missing.length === 0) continue;
    // Originless records cannot safely be claimed as this enrolment's links.
    // A different origin is independent and must never be overwritten either.
    const conflict = missing.some((id) => semesterStates[String(id)]?.selectedClasses.some((item) => (
      item.courseCode.trim().toUpperCase() === owner.courseCode
    )));
    if (inconsistent || conflict)
    {
      skipped.push({ selection, reason: "conflict" });
      continue;
    }
    candidates.push({ selection, missing });
  }
  const counts = new Map<number, number>();
  for (const { missing } of candidates) for (const id of missing) counts.set(id, (counts.get(id) ?? 0) + 1);
  const overfull = new Set([...counts].filter(([id, count]) => (
    (semesterStates[String(id)]?.selectedClasses.length ?? 0) + count > MAX_TIMETABLE_SELECTIONS
  )).map(([id]) => id));
  let projected = semesterStates;
  for (const { selection, missing } of candidates)
  {
    if (missing.some((id) => overfull.has(id)))
    {
      skipped.push({ selection, reason: "capacity" });
      continue;
    }
    projected = reconcileOwnedContinuations(projected, getEnrolmentOwner(selection, semesterId), selection, missing, "restore");
  }
  const changed = projected !== semesterStates;
  return { projectedState: changed ? { ...current, ...projected[String(current.semesterId)], semesterStates: projected } : current, changed, skipped };
}

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
