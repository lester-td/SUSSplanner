import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSavedTimetable, restoreResolvedContinuations, saveTimetableToLocalStorage, TIMETABLE_STORAGE_KEY } from "./local-storage";
import type { PlannerSemesterState, PlannerStorageState, SharedClassIdentifier, TimetableData } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const link = { ...start, originSemesterId: 1 };
const semester = (semesterId: number, selectedClasses: SharedClassIdentifier[]): PlannerSemesterState => ({
  semesterId, selectedClasses, hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all",
});
const state = (): PlannerStorageState => ({ ...semester(1, [start]), orientation: "horizontal", viewMode: "class",
  semesterStates: { "1": semester(1, [start]) } });
const data = (semesterId: number, identifiers: SharedClassIdentifier[], destinations?: number[]): TimetableData => ({
  semester: { semesterId, academicYear: "2027", semesterNo: 1, semesterName: "January 2027" },
  semesterWeeks: [], events: [], clashes: [], unresolvedSelections: [],
  selections: identifiers.map((identifier) => ({ identifier, continuationSemesterIds: destinations })) as TimetableData["selections"],
});
const resolved = data(1, [start], [3]);
const destinations = new Map([[3, data(3, [link])]]);
function storage(initial = state())
{
  let raw: string | null = JSON.stringify(initial);
  const setItem = vi.fn((_key: string, value: string) => { raw = value; });
  const getItem = vi.fn(() => raw);
  vi.stubGlobal("window", { localStorage: { getItem, setItem } });
  return { setItem, getItem, replace: (value: PlannerStorageState | null) => { raw = value ? JSON.stringify(value) : null; } };
}
afterEach(() => vi.unstubAllGlobals());

describe("fresh add-only continuation persistence", () => {
  it("does not rewrite equivalent legacy state just to reorder serialized fields", () => {
    const initial = state();
    const legacy = { groupCode: start.groupCode, courseCode: start.courseCode, scheduleType: start.scheduleType, groupCodeType: start.groupCodeType };
    initial.selectedClasses = initial.semesterStates!["1"].selectedClasses = [legacy];
    const { setItem } = storage(initial);
    saveTimetableToLocalStorage(loadSavedTimetable()!);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("restores once and performs no writes on repeated resolution or passive save", () => {
    const { setItem } = storage();
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(true);
    expect(loadSavedTimetable()?.semesterStates!["3"].selectedClasses).toEqual([link]);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(false);
    saveTimetableToLocalStorage(loadSavedTimetable()!);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it.each(["removed", "replaced", "cleared", "moved"])("discards a resolved start that was %s before persistence", (change) => {
    const { setItem, replace } = storage();
    const latest = state();
    latest.selectedClasses = latest.semesterStates!["1"].selectedClasses = change === "replaced" ? [{ ...start, groupCode: "TG02" }] : [];
    if (change === "moved") latest.semesterStates!["2"] = semester(2, [start]);
    replace(change === "cleared" ? null : latest);
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed ?? false).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("recomputes against unrelated saved changes made during resolution", () => {
    const { setItem, replace } = storage();
    const latest = state();
    latest.semesterStates!["4"] = { ...semester(4, [{ ...start, courseCode: "ICT301" }]), selectedWeekId: 9 };
    latest.semesterStates!["1"].hiddenClasses = ["NIE301:daytime:TG:TG01"];
    latest.hiddenClasses = latest.semesterStates!["1"].hiddenClasses;
    replace(latest);
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadSavedTimetable()?.semesterStates!["4"]).toEqual(latest.semesterStates!["4"]);
    expect(loadSavedTimetable()?.hiddenClasses).toEqual(latest.hiddenClasses);
  });

  it.each(["correct", "conflict", "full"])("revalidates a destination that became %s before resolution completed", (change) => {
    const { setItem, replace } = storage();
    const latest = state();
    const selected = change === "correct" ? [link] : change === "conflict" ? [{ ...link, groupCode: "TG02" }]
      : Array.from({ length: 50 }, (_, index) => ({ ...start, courseCode: `FILL${index}` }));
    latest.semesterStates!["3"] = semester(3, selected);
    replace(latest);
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(loadSavedTimetable()?.semesterStates!["3"].selectedClasses).toEqual(selected);
  });

  it("guards the final synchronous write against a changed saved snapshot", () => {
    const { getItem, setItem } = storage();
    const newer = state();
    newer.semesterStates!["4"] = semester(4, [start]);
    getItem.mockReturnValueOnce(JSON.stringify(state())).mockReturnValue(JSON.stringify(newer));
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("updates the active destination mirror without changing active view metadata", () => {
    const initial = { ...state(), ...semester(3, []), semesterStates: { "1": semester(1, [start]), "3": semester(3, []) } };
    const { setItem } = storage(initial);
    expect(restoreResolvedContinuations(1, resolved, destinations)?.changed).toBe(true);
    expect(loadSavedTimetable()?.selectedClasses).toEqual([link]);
    expect(setItem).toHaveBeenLastCalledWith(TIMETABLE_STORAGE_KEY, expect.any(String));
  });
});
