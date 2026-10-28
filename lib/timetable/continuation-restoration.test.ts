import { describe, expect, it } from "vitest";
import { projectMissingContinuations } from "./import-projection";
import { buildSharedClassIdentifier } from "./share-url";
import type { PlannerSemesterState, PlannerStorageState, SharedClassIdentifier, TimetableData } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const link = { ...start, originSemesterId: 1 };
const second = { ...start, courseCode: "NIE351" };
const semester = (semesterId: number, selectedClasses: SharedClassIdentifier[]): PlannerSemesterState => ({
  semesterId, selectedClasses, hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all",
});
const saved = (starts = [start], destinations: Record<string, PlannerSemesterState> = {}): PlannerStorageState => ({
  ...semester(1, starts), orientation: "vertical", viewMode: "exam",
  semesterStates: { "1": semester(1, starts), ...destinations },
});
const data = (semesterId: number, identifiers: SharedClassIdentifier[], destinations?: number[]): TimetableData => ({
  semester: { semesterId, academicYear: "2027", semesterNo: 1, semesterName: "January 2027" },
  semesterWeeks: [], events: [], clashes: [], unresolvedSelections: [],
  selections: identifiers.map((identifier) => ({ identifier, continuationSemesterIds: destinations })) as TimetableData["selections"],
});
const restore = (current = saved(), destinations: number[] | undefined = [3], starts = [start]) => projectMissingContinuations(
  current, 1, data(1, starts, destinations),
  new Map((destinations ?? []).map((id) => [id, data(id, starts.map((item) => ({ ...item, originSemesterId: 1 })))])),
);

describe("add-only missing continuation projection", () => {
  it("restores every verified missing destination without mutating saved inputs", () => {
    const current = saved();
    const before = structuredClone(current);
    const result = restore(current, [3, 4, 3, 1]);
    expect(result.changed).toBe(true);
    for (const id of [3, 4]) expect(result.projectedState.semesterStates![String(id)].selectedClasses).toEqual([link]);
    expect(result.projectedState.semesterStates!["1"]).toBe(current.semesterStates!["1"]);
    expect(current).toEqual(before);
  });

  it("preserves correct hidden links and all semester metadata while adding missing links", () => {
    const destination = { ...semester(3, [link]), hiddenClasses: [buildSharedClassIdentifier(link)], selectedWeekId: 7,
      courseColorsByCourseCode: { NIE301: "theme-color:2" } };
    const current = saved([start], { "3": destination });
    const result = restore(current, [3, 4]);
    expect(result.projectedState.semesterStates!["3"]).toBe(destination);
    expect(result.projectedState.semesterStates!["4"].selectedClasses).toEqual([link]);
    expect(result.projectedState.selectedWeekId).toBe("all");
    expect(result.projectedState.orientation).toBe("vertical");
  });

  it.each([
    { name: "inconsistent owned", existing: { ...link, groupCode: "TG02" } },
    { name: "originless legacy", existing: start },
    { name: "independent continuation", existing: { ...link, originSemesterId: 2 } },
    { name: "independent start", existing: { ...start, groupCode: "TG02" } },
  ])("preserves $name records and rejects all additions for the enrolment", ({ existing }) => {
    const current = saved([start], { "3": semester(3, [existing]) });
    const result = restore(current, [3, 4]);
    expect(result.projectedState).toBe(current);
    expect(result.skipped).toEqual([{ selection: start, reason: "conflict" }]);
  });

  it("does not reconcile obsolete destinations or inconsistent links outside the required destinations", () => {
    const current = saved([start], { "5": semester(5, [{ ...link, groupCode: "TG02" }]) });
    expect(restore(current).projectedState).toBe(current);
    const correctObsolete = saved([start], { "5": semester(5, [link]) });
    const result = restore(correctObsolete);
    expect(result.projectedState.semesterStates!["5"]).toBe(correctObsolete.semesterStates!["5"]);
    expect(result.projectedState.semesterStates!["3"].selectedClasses).toEqual([link]);
  });

  it("preserves independent same-course enrolments and unrelated classes in other semesters", () => {
    const current = saved([start], { "2": semester(2, [{ ...start, groupCode: "TG02" }]),
      "5": semester(5, [{ ...link, groupCode: "TG02", originSemesterId: 2 }]), "3": semester(3, [second]) });
    const result = restore(current);
    for (const id of [1, 2, 5]) expect(result.projectedState.semesterStates![String(id)]).toBe(current.semesterStates![String(id)]);
    expect(result.projectedState.semesterStates!["3"].selectedClasses).toEqual([second, link]);
  });

  it.each([undefined, []])("defers unknown metadata or preserves explicitly empty destinations (%j)", (destinations) => {
    const current = saved([start], { "3": semester(3, [link]) });
    const result = projectMissingContinuations(current, 1, data(1, [start], destinations), new Map());
    expect(result.projectedState).toBe(current);
    expect(result.changed).toBe(false);
  });

  it("defers the complete enrolment if any published destination cannot be resolved", () => {
    const current = saved();
    const result = projectMissingContinuations(current, 1, data(1, [start], [3, 4]), new Map([[3, data(3, [link])]]));
    expect(result.projectedState).toBe(current);
  });

  it("requires a valid still-saved start and the correct resolved semester and group", () => {
    for (const current of [saved([]), saved([{ ...start, groupCode: "TG02" }])])
      expect(restore(current).projectedState).toBe(current);
    const current = saved();
    expect(restore(current, [3], []).projectedState).toBe(current);
    expect(projectMissingContinuations(current, 1, data(2, [start], [3]), new Map([[3, data(3, [link])]])).projectedState).toBe(current);
  });

  it("skips ambiguous saved starts without letting resolved or saved order choose a winner", () => {
    const alternate = { ...start, groupCode: "TG02" };
    for (const starts of [[start, alternate, second], [second, alternate, start]])
    {
      const current = saved(starts);
      const result = restore(current, [3], starts);
      expect(result.skipped.map((item) => item.selection.groupCode).sort()).toEqual(["TG01", "TG02"]);
      expect(result.projectedState.semesterStates!["1"].selectedClasses).toEqual(starts);
      expect(result.projectedState.semesterStates!["3"].selectedClasses).toEqual([{ ...second, originSemesterId: 1 }]);
    }
  });

  const fill = (count: number) => Array.from({ length: count }, (_, index) => ({ ...start, courseCode: `FILL${index}` }));
  it("accepts the last available slot and is idempotent at capacity", () => {
    const current = saved([start], { "3": semester(3, fill(49)) });
    const result = restore(current);
    expect(result.projectedState.semesterStates!["3"].selectedClasses).toHaveLength(50);
    const again = restore(result.projectedState);
    expect(again.projectedState).toBe(result.projectedState);
    expect(again.changed).toBe(false);
  });

  it("rejects all destinations of an enrolment when one is full", () => {
    const current = saved([start], { "3": semester(3, fill(50)), "5": semester(5, [link]) });
    const result = restore(current, [3, 4, 5]);
    expect(result.projectedState).toBe(current);
    expect(result.skipped).toEqual([{ selection: start, reason: "capacity" }]);
  });

  it("rejects all new-slot competitors deterministically while retaining complete enrolments", () => {
    const complete = { ...start, courseCode: "NIE999" };
    for (const starts of [[start, second, complete], [complete, second, start]])
    {
      const current = saved(starts, { "3": semester(3, [...fill(48), { ...complete, originSemesterId: 1 }]) });
      const result = restore(current, [3], starts);
      expect(result.projectedState).toBe(current);
      expect(result.skipped.map((item) => item.selection.courseCode).sort()).toEqual(["NIE301", "NIE351"]);
      expect(result.skipped.every((item) => item.reason === "capacity")).toBe(true);
    }
  });

  it("does not let a definite conflict consume capacity needed by an eligible enrolment", () => {
    const current = saved([start, second], { "3": semester(3, fill(49)), "4": semester(4, [{ ...link, groupCode: "TG02" }]) });
    const result = restore(current, [3, 4], [start, second]);
    expect(result.projectedState.semesterStates!["3"].selectedClasses).toContainEqual({ ...second, originSemesterId: 1 });
    expect(result.projectedState.semesterStates!["4"].selectedClasses).toEqual([{ ...link, groupCode: "TG02" }, { ...second, originSemesterId: 1 }]);
    expect(result.skipped).toEqual([{ selection: start, reason: "conflict" }]);
  });
});
