import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSavedSemesterState,
  importSharedTimetableToLocalStorage,
  isCourseInTimetable,
  loadSavedTimetable,
  removeCourseCodeFromSavedTimetable,
  removeClassFromSavedTimetable,
  saveTimetableToLocalStorage,
  upsertClassInSavedTimetable,
} from "./local-storage";
import { buildSharedClassIdentifier, decodeShareUrlState, encodeShareUrlState } from "./share-url";
import type { SharedClassIdentifier } from "./types";

const JANUARY = 1;
const JULY = 3;
const NEXT_JANUARY = 14;
const TG: SharedClassIdentifier = {
  courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01",
};
const CRN: SharedClassIdentifier = {
  courseCode: "NIE301", scheduleType: "evening", groupCodeType: "CRN", groupCode: "CRN02",
};

afterEach(() => vi.unstubAllGlobals());

describe("semester ownership of timetable selections", () => {
  it("allows a July start beside a January continuation with the same TG", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    expect(isCourseInTimetable(saved, JULY, "NIE301")).toBe(false);
    saved = upsertClassInSavedTimetable(saved, JULY, TG, [NEXT_JANUARY]);
    const selections = getSavedSemesterState(saved, JULY)!.selectedClasses;
    expect(selections).toEqual([{ ...TG, originSemesterId: JANUARY }, TG]);
    expect(new Set(selections.map(buildSharedClassIdentifier)).size).toBe(2);
    expect(isCourseInTimetable(saved, JULY, "NIE301")).toBe(true);
    expect(getSavedSemesterState(saved, NEXT_JANUARY)!.selectedClasses)
      .toEqual([{ ...TG, originSemesterId: JULY }]);
  });

  it("updates only the continuation owned by the semester whose group changes", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    saved = upsertClassInSavedTimetable(saved, JULY, TG, [NEXT_JANUARY]);
    saved = upsertClassInSavedTimetable(saved, JANUARY, CRN);
    expect(getSavedSemesterState(saved, JULY)!.selectedClasses)
      .toEqual([{ ...CRN, originSemesterId: JANUARY }, TG]);
    expect(getSavedSemesterState(saved, NEXT_JANUARY)!.selectedClasses)
      .toEqual([{ ...TG, originSemesterId: JULY }]);
  });

  it("removes an origin and its continuation without deleting an independent July start", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    saved = upsertClassInSavedTimetable(saved, JULY, CRN, [NEXT_JANUARY]);
    saved = removeCourseCodeFromSavedTimetable(saved, JANUARY, "NIE301");
    expect(getSavedSemesterState(saved, JULY)!.selectedClasses).toEqual([CRN]);
    expect(getSavedSemesterState(saved, NEXT_JANUARY)!.selectedClasses)
      .toEqual([{ ...CRN, originSemesterId: JULY }]);
  });

  it("removes a July start without deleting the January continuation", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    saved = upsertClassInSavedTimetable(saved, JULY, CRN, [NEXT_JANUARY]);
    saved = removeCourseCodeFromSavedTimetable(saved, JULY, "NIE301");
    expect(getSavedSemesterState(saved, JULY)!.selectedClasses)
      .toEqual([{ ...TG, originSemesterId: JANUARY }]);
    expect(getSavedSemesterState(saved, NEXT_JANUARY)!.selectedClasses).toEqual([]);
  });

  it("preserves a hidden continuation when adding or switching the July start", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    const carriedKey = buildSharedClassIdentifier({ ...TG, originSemesterId: JANUARY });
    saved.semesterStates![String(JULY)].hiddenClasses = [carriedKey];
    saved = upsertClassInSavedTimetable(saved, JULY, TG);
    saved = upsertClassInSavedTimetable(saved, JULY, CRN);
    expect(saved.hiddenClasses).toEqual([carriedKey]);
  });

  it("deletes a carried-over entry from July without removing a separate July start", () => {
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    saved = upsertClassInSavedTimetable(saved, JULY, TG, [NEXT_JANUARY]);
    saved = removeClassFromSavedTimetable(saved, JULY, { ...TG, originSemesterId: JANUARY });
    expect(saved.semesterId).toBe(JULY);
    expect(saved.selectedClasses).toEqual([TG]);
    expect(getSavedSemesterState(saved, JANUARY)!.selectedClasses).toEqual([]);
    expect(getSavedSemesterState(saved, NEXT_JANUARY)!.selectedClasses).toEqual([{ ...TG, originSemesterId: JULY }]);
    saved = upsertClassInSavedTimetable(saved, JANUARY, CRN);
    expect(getSavedSemesterState(saved, JULY)!.selectedClasses).toEqual([TG]);
  });

  it("keeps ownership through browser storage and share links", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    let saved = upsertClassInSavedTimetable(null, JANUARY, TG, [JULY]);
    saveTimetableToLocalStorage(saved);
    saved = upsertClassInSavedTimetable(loadSavedTimetable(), JULY, TG);
    saveTimetableToLocalStorage(saved);
    const reloaded = loadSavedTimetable()!;
    expect(reloaded.selectedClasses).toEqual([{ ...TG, originSemesterId: JANUARY }, TG]);
    const shared = decodeShareUrlState(new URLSearchParams(encodeShareUrlState(reloaded).split("?")[1]));
    expect(shared.selectedClasses).toEqual([TG, { ...TG, originSemesterId: JANUARY }]);
    // Explicit removal cleans the linked enrollment; a passive save does not.
    const origin = getSavedSemesterState(reloaded, JANUARY)!;
    saveTimetableToLocalStorage({ ...reloaded, ...origin, selectedClasses: [] });
    expect(getSavedSemesterState(loadSavedTimetable(), JULY)!.selectedClasses)
      .toEqual([{ ...TG, originSemesterId: JANUARY }, TG]);
    saveTimetableToLocalStorage(removeCourseCodeFromSavedTimetable(loadSavedTimetable(), JANUARY, "NIE301"));
    expect(getSavedSemesterState(loadSavedTimetable(), JULY)!.selectedClasses).toEqual([TG]);
  });

  it("does not change imported continuation slices when loading or saving another semester", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    const imported = { ...TG, originSemesterId: JANUARY };
    importSharedTimetableToLocalStorage({ semesterId: JULY, selectedClasses: [imported] });
    const july = getSavedSemesterState(loadSavedTimetable(), JULY)!;
    saveTimetableToLocalStorage({
      semesterId: JANUARY, selectedClasses: [], hiddenClasses: [],
      courseColorsByCourseCode: {}, selectedWeekId: "all", orientation: "horizontal", viewMode: "class",
    });
    expect(getSavedSemesterState(loadSavedTimetable(), JULY)).toEqual(july);
    // An explicit group update still changes the linked continuation.
    saveTimetableToLocalStorage(upsertClassInSavedTimetable(loadSavedTimetable(), JANUARY, CRN));
    expect(getSavedSemesterState(loadSavedTimetable(), JULY)!.selectedClasses)
      .toEqual([{ ...CRN, originSemesterId: JANUARY }]);
  });

  it("replaces only the imported semester even if its prior start has a later link", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    let saved = upsertClassInSavedTimetable(null, JULY, TG, [NEXT_JANUARY]);
    saved = upsertClassInSavedTimetable(saved, JANUARY, CRN);
    saveTimetableToLocalStorage(saved);
    const beforeJanuary = getSavedSemesterState(loadSavedTimetable(), JANUARY)!;
    const beforeNextJanuary = getSavedSemesterState(loadSavedTimetable(), NEXT_JANUARY)!;
    importSharedTimetableToLocalStorage({ semesterId: JULY, selectedClasses: [{ ...TG, groupCode: "TG02" }] }, loadSavedTimetable());
    expect(getSavedSemesterState(loadSavedTimetable(), JANUARY)).toEqual(beforeJanuary);
    expect(getSavedSemesterState(loadSavedTimetable(), NEXT_JANUARY)).toEqual(beforeNextJanuary);
  });
});
