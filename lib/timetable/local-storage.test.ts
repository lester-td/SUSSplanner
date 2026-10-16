import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSavedSemesterState,
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
    // A reset in the starting semester cleans only its linked continuations.
    const origin = getSavedSemesterState(reloaded, JANUARY)!;
    saveTimetableToLocalStorage({ ...reloaded, ...origin, selectedClasses: [] });
    expect(getSavedSemesterState(loadSavedTimetable(), JULY)!.selectedClasses).toEqual([TG]);
  });
});

describe("published continuation destinations on a start-group change", () => {
  const ORIGIN = 14;
  const TARGET = 28;
  const nextGroup = (courseCode: string, groupCode: string, groupCodeType: "TG" | "CRN" = "CRN"): SharedClassIdentifier => ({
    courseCode, scheduleType: groupCodeType === "TG" ? "daytime" : "evening", groupCodeType, groupCode,
  });

  it("updates NIE301 TG01 to TG02 at the same published destination without duplicating its link", () => {
    const first = nextGroup("NIE301", "TG01", "TG");
    const second = nextGroup("NIE301", "TG02", "TG");
    let saved = upsertClassInSavedTimetable(null, ORIGIN, first, [TARGET]);
    saved = upsertClassInSavedTimetable(saved, TARGET, nextGroup("ICT302", "CRN01"));
    saved = upsertClassInSavedTimetable(saved, ORIGIN, second, [TARGET]);
    expect(getSavedSemesterState(saved, TARGET)!.selectedClasses)
      .toEqual([{ ...second, originSemesterId: ORIGIN }, nextGroup("ICT302", "CRN01")]);
    expect(getSavedSemesterState(saved, ORIGIN)!.selectedClasses).toEqual([second]);
  });

  it("adds MBA599's newly published destination when changing CRN01 to CRN02", () => {
    const first = nextGroup("MBA599", "CRN01");
    const second = nextGroup("MBA599", "CRN02");
    const saved = upsertClassInSavedTimetable(upsertClassInSavedTimetable(null, ORIGIN, first, []), ORIGIN, second, [TARGET]);
    expect(getSavedSemesterState(saved, TARGET)!.selectedClasses).toEqual([{ ...second, originSemesterId: ORIGIN }]);
  });

  it("removes SWK512's obsolete destination and hidden key when CRN02 publishes none", () => {
    const first = nextGroup("SWK512", "CRN01");
    const second = nextGroup("SWK512", "CRN02");
    let saved = upsertClassInSavedTimetable(null, ORIGIN, first, [TARGET]);
    saved = upsertClassInSavedTimetable(saved, TARGET, nextGroup("SWK512", "CRN03"), [29]);
    saved = upsertClassInSavedTimetable(saved, TARGET, nextGroup("ICT302", "CRN01"));
    saved.semesterStates![String(TARGET)].hiddenClasses = [buildSharedClassIdentifier({ ...first, originSemesterId: ORIGIN })];
    saved = upsertClassInSavedTimetable(saved, ORIGIN, second, []);
    expect(getSavedSemesterState(saved, TARGET)!.selectedClasses)
      .toEqual([nextGroup("SWK512", "CRN03"), nextGroup("ICT302", "CRN01")]);
    expect(getSavedSemesterState(saved, TARGET)!.hiddenClasses).toEqual([]);
    expect(getSavedSemesterState(saved, 29)!.selectedClasses)
      .toEqual([{ ...nextGroup("SWK512", "CRN03"), originSemesterId: TARGET }]);
  });

  it("reconciles multiple destinations while preserving unrelated owners and semester state", () => {
    const first = nextGroup("NIE301", "TG01", "TG");
    const second = nextGroup("NIE301", "TG02", "TG");
    let saved = upsertClassInSavedTimetable(null, ORIGIN, first, [TARGET, 29]);
    saved = upsertClassInSavedTimetable(saved, 29, nextGroup("ICT302", "CRN01"));
    saved = upsertClassInSavedTimetable(saved, ORIGIN, second, [29, 30]);
    expect(getSavedSemesterState(saved, TARGET)!.selectedClasses).toEqual([]);
    expect(getSavedSemesterState(saved, 29)!.selectedClasses)
      .toEqual([{ ...second, originSemesterId: ORIGIN }, nextGroup("ICT302", "CRN01")]);
    expect(getSavedSemesterState(saved, 30)!.selectedClasses).toEqual([{ ...second, originSemesterId: ORIGIN }]);
  });

  it("keeps existing destinations when publication metadata is missing, including after reload", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    } });
    const first = nextGroup("NIE301", "TG01", "TG");
    const second = nextGroup("NIE301", "TG02", "TG");
    saveTimetableToLocalStorage(upsertClassInSavedTimetable(null, ORIGIN, first, [TARGET]));
    saveTimetableToLocalStorage(upsertClassInSavedTimetable(loadSavedTimetable(), ORIGIN, second));
    expect(getSavedSemesterState(loadSavedTimetable(), TARGET)!.selectedClasses)
      .toEqual([{ ...second, originSemesterId: ORIGIN }]);
    const target = getSavedSemesterState(loadSavedTimetable(), TARGET)!;
    saveTimetableToLocalStorage({ ...loadSavedTimetable()!, ...target });
    expect(getSavedSemesterState(loadSavedTimetable(), TARGET)!.selectedClasses)
      .toEqual([{ ...second, originSemesterId: ORIGIN }]);
  });
});
