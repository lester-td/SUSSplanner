import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimetableImportProposal, commitTimetableImport } from "./import-proposal";
import { getSavedSemesterState, loadSavedTimetable, saveTimetableToLocalStorage, upsertClassInSavedTimetable } from "./local-storage";
import { buildTimetableImportEffects } from "./import-comparison";
import { buildSharedClassIdentifier as keyOf } from "./share-url";
import type { PlannerStorageState, SharedClassIdentifier, TimetableData } from "./types";

const group = (courseCode = "NIE301", groupCode = "TG01", originSemesterId?: number): SharedClassIdentifier => ({
  courseCode, groupCode, groupCodeType: "TG", scheduleType: "daytime",
  ...(originSemesterId === undefined ? {} : { originSemesterId }),
});
const old = group();
const replacement = group("NIE301", "TG02");
const other = group("ICT301");
const data = (identifiers: SharedClassIdentifier[], destinations?: number[]) => ({
  selections: identifiers.map((identifier) => ({ identifier, ...(destinations === undefined ? {} : { continuationSemesterIds: destinations }) })),
}) as TimetableData;
const selections = (state: PlannerStorageState, id: number) => getSavedSemesterState(state, id)?.selectedClasses ?? [];
function proposal(current: PlannerStorageState | null, incoming: SharedClassIdentifier[], destinations?: number[], valid = incoming)
{
  return buildTimetableImportProposal({
    incoming: { semesterId: 1, selectedClasses: incoming }, current,
    incomingTimetable: data(valid, destinations), savedTimetable: null,
    continuationTimetables: new Map((destinations ?? []).map((id) => [id, data(valid.map((item) => ({ ...item, originSemesterId: 1 })))])),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("explicit import enrolment reconciliation", () => {
  it.each([{ destinations: [3] }, { destinations: [4] }, { destinations: [3, 4] }, { destinations: [] }])("replaces a starting group with published destinations $destinations", ({ destinations }) => {
    const current = upsertClassInSavedTimetable(null, 1, old, [3]);
    const before = structuredClone(current);
    const result = proposal(current, [replacement], destinations);
    expect(result.canImport).toBe(true);
    expect(selections(result.projectedState, 1)).toEqual([replacement]);
    for (const id of [3, 4]) expect(selections(result.projectedState, id)).toEqual(destinations.includes(id) ? [{ ...replacement, originSemesterId: 1 }] : []);
    expect(result.skipped).toEqual([]);
    expect(result.unverifiedContinuations).toEqual([]);
    expect(current).toEqual(before);
  });

  it("projects missing links for an unchanged start into comparison and no-op decisions", () => {
    const current = upsertClassInSavedTimetable(null, 1, old, []);
    const before = structuredClone(current);
    const reviewed = proposal(current, [old], [3, 4]);
    expect(reviewed.canImport).toBe(true);
    expect(selections(reviewed.projectedState, 1)).toEqual([old]);
    const effects = buildTimetableImportEffects(current, reviewed.projectedState);
    expect(effects.hasChanges).toBe(true);
    expect(effects.semesters.map((item) => item.semesterId)).toEqual([3, 4]);
    for (const id of [3, 4]) expect(selections(reviewed.projectedState, id)).toEqual([{ ...old, originSemesterId: 1 }]);
    expect(current).toEqual(before); // Preview/cancellation cannot write additions.
    const complete = proposal(reviewed.projectedState, [old], [3, 4]);
    expect(buildTimetableImportEffects(reviewed.projectedState, complete.projectedState).hasChanges).toBe(false);
  });

  it("removes an omitted start and all its links, preserving unrelated metadata and independent enrolments", () => {
    let current = upsertClassInSavedTimetable(null, 1, old, [3, 4]);
    current = upsertClassInSavedTimetable(current, 3, replacement, [5]);
    current = upsertClassInSavedTimetable(current, 4, { ...old, originSemesterId: 2 });
    current = upsertClassInSavedTimetable(current, 6, other);
    current.semesterStates!["3"].hiddenClasses = [keyOf({ ...old, originSemesterId: 1 }), keyOf(replacement)];
    current.semesterStates!["3"].selectedWeekId = 7;
    current.semesterStates!["3"].courseColorsByCourseCode = { NIE301: "theme-color:3" };
    const result = proposal(current, [other], []);
    expect(selections(result.projectedState, 3)).toEqual([replacement]);
    expect(selections(result.projectedState, 4)).toEqual([{ ...old, originSemesterId: 2 }]);
    expect(result.projectedState.semesterStates!["3"]).toMatchObject({ hiddenClasses: [keyOf(replacement)], selectedWeekId: 7, courseColorsByCourseCode: { NIE301: "theme-color:3" } });
    for (const id of [5, 6]) expect(result.projectedState.semesterStates![String(id)]).toEqual(current.semesterStates![String(id)]);
  });

  it("keeps correct hidden links but cleans obsolete group keys", () => {
    const current = upsertClassInSavedTimetable(null, 1, old, [3]);
    current.semesterStates!["3"].hiddenClasses = [keyOf({ ...old, originSemesterId: 1 })];
    expect(proposal(current, [old], [3]).projectedState.semesterStates!["3"]).toEqual(current.semesterStates!["3"]);
    expect(proposal(current, [replacement], [3]).projectedState.semesterStates!["3"].hiddenClasses).toEqual([]);
  });

  it("allows missing metadata with a separate warning and drops obsolete links", () => {
    const current = upsertClassInSavedTimetable(null, 1, old, [3, 4]);
    const result = proposal(current, [replacement]);
    expect(result).toMatchObject({ canImport: true, skipped: [], unverifiedContinuations: [replacement] });
    for (const id of [3, 4]) expect(selections(result.projectedState, id)).toEqual([]);
  });

  it("does not invent unavailable published destinations or borrow old ones", () => {
    const current = upsertClassInSavedTimetable(null, 1, old, [3]);
    const result = buildTimetableImportProposal({ incoming: { semesterId: 1, selectedClasses: [replacement] }, current,
      incomingTimetable: data([replacement], [4, 5]), savedTimetable: null,
      continuationTimetables: new Map([[4, data([{ ...replacement, originSemesterId: 1 }])], [5, data([])]]),
    });
    expect(result.unverifiedContinuations).toEqual([replacement]);
    expect(selections(result.projectedState, 3)).toEqual([]);
    expect(selections(result.projectedState, 4)).toEqual([{ ...replacement, originSemesterId: 1 }]);
    expect(selections(result.projectedState, 5)).toEqual([]);
  });

  it("restores an unresolved attempted replacement instead of treating it as omission", () => {
    let current = upsertClassInSavedTimetable(null, 1, old, [3, 4]);
    current = upsertClassInSavedTimetable(current, 1, group("ICT302"), [5]);
    const result = proposal(current, [replacement, other], [], [other]);
    expect(result.skipped).toEqual([{ selection: replacement, reason: "unresolved" }]);
    expect(selections(result.projectedState, 1)).toEqual([other, old]);
    for (const id of [3, 4]) expect(result.projectedState.semesterStates![String(id)]).toEqual(current.semesterStates![String(id)]);
    expect(selections(result.projectedState, 5)).toEqual([]); // intentional omission
  });

  const fill = (current: PlannerStorageState, id: number, count: number) => {
    let next = current;
    for (let index = 0; index < count; index += 1) next = upsertClassInSavedTimetable(next, id, group(`FILL${index}`));
    return next;
  };

  it("accounts for replaced links before capacity checks", () => {
    const current = fill(upsertClassInSavedTimetable(null, 1, old, [3]), 3, 49);
    const result = proposal(current, [replacement], [3]);
    expect(result.canImport).toBe(true);
    expect(selections(result.projectedState, 3)).toHaveLength(50);
    expect(selections(result.projectedState, 3)).toContainEqual({ ...replacement, originSemesterId: 1 });
  });

  it("rejects an entire replacement at capacity and preserves its complete previous enrolment", () => {
    const current = fill(upsertClassInSavedTimetable(null, 1, old, [4, 5]), 3, 50);
    const result = proposal(current, [replacement, other], [3]);
    // Both inputs publish 3 here, so both are conservatively rejected.
    expect(result.skipped.map((item) => item.reason)).toEqual(["capacity", "capacity"]);
    expect(selections(result.projectedState, 1)).toEqual([old]);
    for (const id of [3, 4, 5]) expect(result.projectedState.semesterStates![String(id)]).toEqual(current.semesterStates![String(id)]);
  });

  it("rejects competing incoming enrolments independent of URL order and accepts unrelated ones", () => {
    const current = fill(upsertClassInSavedTimetable(null, 1, old, [4]), 3, 49);
    const second = group("NIE351");
    for (const inputs of [[replacement, second, other], [other, second, replacement]])
    {
      const result = buildTimetableImportProposal({ incoming: { semesterId: 1, selectedClasses: inputs }, current,
        incomingTimetable: { selections: [...data([replacement, second], [3]).selections, ...data([other], []).selections] } as TimetableData,
        savedTimetable: null, continuationTimetables: new Map([[3, data([replacement, second].map((item) => ({ ...item, originSemesterId: 1 })))]]),
      });
      expect(result.canImport).toBe(true);
      expect(result.skipped.map((item) => item.selection.courseCode).sort()).toEqual(["NIE301", "NIE351"]);
      expect(selections(result.projectedState, 1)).toEqual([other, old]);
      expect(result.projectedState.semesterStates!["4"]).toEqual(current.semesterStates!["4"]);
      expect(result.projectedState.semesterStates!["3"]).toEqual(current.semesterStates!["3"]);
    }
  });

  it("recomputes capacity when rejected replacements restore old destinations", () => {
    const second = group("NIE351");
    let current = fill(upsertClassInSavedTimetable(null, 1, old, [4]), 3, 50);
    current = fill(current, 4, 49);
    const result = buildTimetableImportProposal({ incoming: { semesterId: 1, selectedClasses: [replacement, second, other] }, current,
      incomingTimetable: { selections: [...data([replacement], [3]).selections, ...data([second], [4]).selections, ...data([other], []).selections] } as TimetableData,
      savedTimetable: null, continuationTimetables: new Map([[3, data([{ ...replacement, originSemesterId: 1 }])], [4, data([{ ...second, originSemesterId: 1 }])]]),
    });
    expect(result.skipped.map((item) => item.selection)).toEqual([replacement, second]);
    expect(result.canImport).toBe(true);
    expect(selections(result.projectedState, 1)).toEqual([other, old]);
    expect(selections(result.projectedState, 4)).toHaveLength(50);
  });

  it("keeps passive saving and reload non-destructive without continuation metadata", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } });
    const current = upsertClassInSavedTimetable(null, 1, old, [3, 4]);
    saveTimetableToLocalStorage(current);
    expect(loadSavedTimetable()).toEqual(current);
    saveTimetableToLocalStorage(loadSavedTimetable()!);
    expect(loadSavedTimetable()).toEqual(current);
    expect(selections(loadSavedTimetable()!, 3)).toEqual([{ ...old, originSemesterId: 1 }]);
  });

  it("persists exactly the reviewed multi-semester projection once and rejects stale state", () => {
    const storage = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem } });
    saveTimetableToLocalStorage(upsertClassInSavedTimetable(null, 1, old, [3, 4]));
    const current = loadSavedTimetable();
    const expectedSavedState = JSON.stringify(current);
    setItem.mockClear();
    const reviewed = proposal(current, [replacement], [3, 5]);
    expect(setItem).not.toHaveBeenCalled();
    expect(commitTimetableImport({ semesterId: 1, proposal: reviewed, expectedSavedState })).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadSavedTimetable()).toEqual(reviewed.projectedState);
    expect(commitTimetableImport({ semesterId: 1, proposal: reviewed, expectedSavedState })).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
