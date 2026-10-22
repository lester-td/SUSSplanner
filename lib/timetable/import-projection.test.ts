import { afterEach, describe, expect, it, vi } from "vitest";
import { projectTimetableImport } from "./import-projection";
import {
  importSharedTimetableToLocalStorage,
  loadSavedTimetable,
  saveTimetableToLocalStorage,
  TIMETABLE_STORAGE_KEY,
} from "./local-storage";
import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerSemesterState, PlannerStorageState, SharedClassIdentifier } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const kept = { ...start, originSemesterId: 1 };
const ordinary = { ...start, courseCode: "ICT301" };
const added = { ...start, courseCode: "ICT302" };
const semester = (semesterId: number, selectedClasses: SharedClassIdentifier[]): PlannerSemesterState => ({
  semesterId, selectedClasses, hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all",
});
const savedState = (): PlannerStorageState => {
  const target = {
    ...semester(3, [ordinary, kept]),
    hiddenClasses: [buildSharedClassIdentifier(ordinary), buildSharedClassIdentifier(kept)],
    courseColorsByCourseCode: { NIE301: "theme-color:2", ICT301: "theme-color:4" },
    selectedWeekId: 7,
  };
  return {
    ...target, orientation: "vertical", viewMode: "exam",
    semesterStates: {
      "1": { ...semester(1, [start]), hiddenClasses: [buildSharedClassIdentifier(start)], selectedWeekId: 2 },
      "3": target,
      "14": { ...semester(14, [{ ...ordinary, originSemesterId: 3 }]), courseColorsByCourseCode: { ICT301: "theme-color:1" } },
    },
  };
};

function freeze<T>(value: T): T
{
  if (value && typeof value === "object")
  {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => vi.unstubAllGlobals());

describe("pure timetable import projection", () => {
  it("projects an import into empty storage with the existing view defaults", () => {
    const target = semester(3, [added]);
    expect(projectTimetableImport({ semesterId: 3, selectedClasses: [added] })).toEqual({
      ...target, orientation: "horizontal", viewMode: "class", semesterStates: { "3": target },
    });
  });

  it("replaces ordinary selections, keeps supplied links, and resets only the target view", () => {
    const current = freeze(savedState());
    const incoming = freeze({ semesterId: 3, selectedClasses: [added, kept] });
    const before = structuredClone({ current, incoming });
    const projected = projectTimetableImport(incoming, current);

    expect(projected).toEqual({
      ...current,
      selectedClasses: [added, kept], hiddenClasses: [], selectedWeekId: "all",
      semesterStates: {
        ...current.semesterStates,
        "3": { ...current.semesterStates!["3"], selectedClasses: [added, kept], hiddenClasses: [], selectedWeekId: "all" },
      },
    });
    expect({ current, incoming }).toEqual(before);
  });

  it("leaves existing outgoing links untouched when the imported start changes or is omitted", () => {
    const current = savedState();
    for (const selectedClasses of [[{ ...ordinary, groupCode: "TG02" }], [added]])
    {
      const projected = projectTimetableImport({ semesterId: 3, selectedClasses }, current);
      expect(projected.semesterStates!["14"]).toEqual(current.semesterStates!["14"]);
      expect(projected.semesterStates!["1"]).toEqual(current.semesterStates!["1"]);
    }
  });

  it.each([
    { name: "empty storage", current: null },
    { name: "existing semesters and view preferences", current: savedState() },
  ])("matches persistence for $name without reading or writing during projection", ({ current }) => {
    const data = new Map<string, string>();
    const getItem = vi.fn((key: string) => data.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => data.set(key, value));
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    if (current) saveTimetableToLocalStorage(current);
    const saved = loadSavedTimetable();
    const before = data.get(TIMETABLE_STORAGE_KEY);
    getItem.mockClear();
    setItem.mockClear();

    const incoming = { semesterId: 3, selectedClasses: [added, kept] };
    const projected = projectTimetableImport(incoming, saved);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(data.get(TIMETABLE_STORAGE_KEY)).toBe(before);

    expect(importSharedTimetableToLocalStorage(incoming, saved)).toEqual(projected);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadSavedTimetable()).toEqual(projected);
  });
});
