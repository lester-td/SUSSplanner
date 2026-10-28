import { afterEach, expect, it, vi } from "vitest";
import { resolveContinuationTimetables } from "./continuation-resolution";
import type { SharedClassIdentifier, TimetableData } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const second = { ...start, courseCode: "NIE351" };
const published = (destinations?: number[]) => ({
  selections: [start, second].map((identifier) => ({ identifier, continuationSemesterIds: destinations })),
}) as TimetableData;

afterEach(() => vi.unstubAllGlobals());

it("batches destinations through the existing resolver and only requests starting identifiers", async () => {
  const response = published([]);
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ timetable: response }) }));
  vi.stubGlobal("fetch", fetcher);
  const result = await resolveContinuationTimetables({ semesterId: 1, selectedClasses: [start, second, { ...start, originSemesterId: 2 }] }, published([1, 3, 3, 4]));
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [url] of fetcher.mock.calls)
  {
    expect(url).toContain("NIE301:TG01@1");
    expect(url).toContain("NIE351:TG01@1");
    expect(url).not.toContain("@2");
  }
  expect([...result.keys()].sort()).toEqual([3, 4]);
});

it.each([undefined, []])("does not guess destinations when metadata is %j", async (destinations) => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await resolveContinuationTimetables({ semesterId: 1, selectedClasses: [start] }, published(destinations))).toEqual(new Map());
  expect(fetcher).not.toHaveBeenCalled();
});

it("keeps failed destination requests unverified and honours cancellation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("sem=3")) throw new Error("Unavailable");
    return { ok: false };
  }));
  expect(await resolveContinuationTimetables({ semesterId: 1, selectedClasses: [start] }, published([3, 4]))).toEqual(new Map());
  const controller = new AbortController();
  vi.stubGlobal("fetch", vi.fn(async () => {
    controller.abort();
    return { ok: true, json: async () => ({ timetable: published([]) }) };
  }));
  expect(await resolveContinuationTimetables({ semesterId: 1, selectedClasses: [start] }, published([3]), controller.signal)).toEqual(new Map());
});
