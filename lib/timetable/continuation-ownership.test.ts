import { describe, expect, it } from "vitest";
import { getContinuationDestinationIds, getEnrolmentOwner, isOwnedContinuation } from "./continuation-ownership";
import type { PlannerSemesterState, SharedClassIdentifier } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const january = getEnrolmentOwner(start, 1);
const july = getEnrolmentOwner(start, 3);
const link = { ...start, originSemesterId: 1 };
const semester = (semesterId: number, selectedClasses: SharedClassIdentifier[]): PlannerSemesterState => ({
  semesterId, selectedClasses, hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all",
});

describe("continuation ownership and destinations", () => {
  it("identifies a start by its semester and a continuation by its originating semester", () => {
    expect(january).toEqual({ courseCode: "NIE301", originSemesterId: 1 });
    expect(july).toEqual({ courseCode: "NIE301", originSemesterId: 3 });
    expect(getEnrolmentOwner(link, 3)).toEqual(january);
  });

  it("distinguishes owned links from independent starts, other origins, and other courses", () => {
    expect(isOwnedContinuation(link, january)).toBe(true);
    expect(isOwnedContinuation({ ...link, groupCode: "TG02" }, january)).toBe(true);
    expect(isOwnedContinuation(start, january)).toBe(false);
    expect(isOwnedContinuation(link, july)).toBe(false);
    expect(isOwnedContinuation({ ...link, courseCode: "ICT301" }, january)).toBe(false);
  });

  it("uses published destinations without borrowing existing destinations or mutating inputs", () => {
    const saved = Object.freeze([semester(3, [link])]);
    const published = Object.freeze([1, 14, 14, 28]);
    const destinations = getContinuationDestinationIds(saved, january, published);
    expect([...destinations]).toEqual([14, 28]);
    expect(published).toEqual([1, 14, 14, 28]);
    expect(saved).toEqual([semester(3, [link])]);
  });

  it("distinguishes missing publication metadata from an explicit empty destination list", () => {
    const saved = [semester(1, [link]), semester(3, [link, start]), semester(14, [{ ...start, originSemesterId: 3 }])];
    expect([...getContinuationDestinationIds(saved, january)]).toEqual([3]);
    expect([...getContinuationDestinationIds(saved, january, [])]).toEqual([]);
    expect([...getContinuationDestinationIds(saved, july)]).toEqual([14]);
  });

  it("does not require a saved start to identify an originless continuation's owner", () => {
    const saved = [semester(3, [link])];
    expect(getEnrolmentOwner(link, 3)).toEqual(january);
    expect(isOwnedContinuation(link, january)).toBe(true);
    expect([...getContinuationDestinationIds(saved, january)]).toEqual([3]);
  });
});
