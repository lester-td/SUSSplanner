import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSavedSemesterState, loadSavedTimetable, removeClassFromSavedTimetable,
  restoreMissingContinuationLinks, saveTimetableToLocalStorage, upsertClassInSavedTimetable,
} from "./local-storage";
import type { SharedClassIdentifier } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const link = { ...start, originSemesterId: 1 };
const resolved = (continuationSemesterIds?: number[]) => ({ identifier: start, continuationSemesterIds });
afterEach(() => vi.unstubAllGlobals());

describe("restoring published continuation links", () => {
  it("restores a legacy start across multiple destinations and is idempotent after reload", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    // Legacy v1 payload without the semesterStates map.
    saveTimetableToLocalStorage({ semesterId: 1, selectedClasses: [start], hiddenClasses: [],
      courseColorsByCourseCode: {}, selectedWeekId: "all", orientation: "horizontal", viewMode: "class" });
    const result = restoreMissingContinuationLinks(loadSavedTimetable(), 1, [resolved([3, 14, 3, 1])]);
    expect(result.changed).toBe(true);
    expect(result.conflicts).toEqual([]);
    expect(getSavedSemesterState(result.state, 3)?.selectedClasses).toEqual([link]);
    expect(getSavedSemesterState(result.state, 14)?.selectedClasses).toEqual([link]);
    saveTimetableToLocalStorage(result.state!);
    const reloaded = loadSavedTimetable();
    expect(restoreMissingContinuationLinks(reloaded, 1, [resolved([3, 14])])).toEqual({ state: reloaded, changed: false, conflicts: [] });
  });

  it.each([undefined, []])("preserves saved links with destination metadata %j", (ids) => {
    const saved = upsertClassInSavedTimetable(null, 1, start, [3]);
    expect(restoreMissingContinuationLinks(saved, 1, [resolved(ids)]).state).toBe(saved);
  });

  it("preserves correct links, hidden keys, independent starts and unrelated semesters", () => {
    let saved = upsertClassInSavedTimetable(null, 1, start, [3]);
    saved = upsertClassInSavedTimetable(saved, 3, start, [14]);
    saved = upsertClassInSavedTimetable(saved, 9, { ...start, courseCode: "ICT301" });
    const before = structuredClone(saved);
    const result = restoreMissingContinuationLinks(saved, 1, [resolved([3, 14])]);
    expect(getSavedSemesterState(result.state, 3)).toEqual(getSavedSemesterState(before, 3));
    expect(getSavedSemesterState(result.state, 9)).toEqual(getSavedSemesterState(before, 9));
    expect(getSavedSemesterState(result.state, 14)?.selectedClasses).toEqual([{ ...start, originSemesterId: 3 }, link]);
    expect(saved).toEqual(before);
    const removed = removeClassFromSavedTimetable(result.state, 14, link);
    expect(getSavedSemesterState(removed, 1)?.selectedClasses).toEqual([]);
    expect(getSavedSemesterState(removed, 3)?.selectedClasses).toEqual([start]);
  });

  it("reports conflicting destinations without silently choosing a group", () => {
    let saved = upsertClassInSavedTimetable(null, 1, start);
    saved = upsertClassInSavedTimetable(saved, 3, { ...link, groupCode: "TG02" });
    const result = restoreMissingContinuationLinks(saved, 1, [resolved([3])]);
    expect(result).toEqual({ state: saved, changed: false, conflicts: [{ selection: start, semesterId: 3 }] });
  });

  it("ignores late responses after removal, group changes, or an unresolved origin", async () => {
    const initial = upsertClassInSavedTimetable(null, 1, start);
    const response = Promise.resolve([resolved([3])]);
    const removed = removeClassFromSavedTimetable(initial, 1, start);
    const changed = upsertClassInSavedTimetable(initial, 1, { ...start, groupCode: "TG02" }, []);
    for (const saved of [removed, changed, null])
      expect(restoreMissingContinuationLinks(saved, 1, await response).state).toBe(saved);
    expect(restoreMissingContinuationLinks(initial, 3, await response).state).toBe(initial);
    expect(restoreMissingContinuationLinks(initial, 1, [{ identifier: link, continuationSemesterIds: [14] }]).state).toBe(initial);
  });
});
