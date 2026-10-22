import { describe, expect, it } from "vitest";
import { plannerStorageStateSchema, sharedTimetableStateSchema } from "@/lib/validation/timetable";

const selections = (count: number) => Array.from({ length: count }, (_, index) => ({
  courseCode: `ICT${100 + index}`, scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01",
}));

describe("timetable selection limit", () => {
  it("continues to allow 50 shared selections and reject 51", () => {
    expect(sharedTimetableStateSchema.safeParse({ semesterId: 1, selectedClasses: selections(50) }).success).toBe(true);
    expect(sharedTimetableStateSchema.safeParse({ semesterId: 1, selectedClasses: selections(51) }).success).toBe(false);
  });

  it("enforces the same limit in saved non-active semesters", () => {
    const state = {
      semesterId: 1, selectedClasses: [], hiddenClasses: [], courseColorsByCourseCode: {}, selectedWeekId: "all",
      orientation: "horizontal", viewMode: "class",
    };
    const target = { ...state, semesterId: 3, selectedClasses: selections(50) };
    expect(plannerStorageStateSchema.safeParse({ ...state, semesterStates: { "3": target } }).success).toBe(true);
    expect(plannerStorageStateSchema.safeParse({ ...state, semesterStates: {
      "3": { ...target, selectedClasses: selections(51) },
    } }).success).toBe(false);
  });
});
