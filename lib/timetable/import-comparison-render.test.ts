import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportComparison } from "@/components/timetable/import-comparison";
import { buildTimetableImportComparison } from "./import-comparison";
import type { SharedClassIdentifier } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const render = (saved: SharedClassIdentifier[], next: SharedClassIdentifier[], preserved: SharedClassIdentifier[] = []) => renderToStaticMarkup(createElement(ImportComparison, {
  comparison: buildTimetableImportComparison(saved, { selectedClasses: next, preservedSelections: preserved }),
  semesters: [{ semesterId: 14, semesterName: "January 2027", academicYear: "2026/2027", semesterNo: 2 }],
}));

describe("import comparison labels", () => {
  it("labels categories and the originating semester of kept continuations", () => {
    const link = { ...start, originSemesterId: 14 };
    const added = { ...start, courseCode: "ICT302" };
    const html = render([link, start], [link, added], [link]);
    expect(html).toContain('aria-label="Added"');
    expect(html).toContain('aria-label="Removed"');
    expect(html).toContain('aria-label="Kept"');
    expect(html).toContain("continuation from January 2027");
    expect(html).toContain("ICT302 TG01");
  });

  it("renders group changes and explains unchanged results without additions or removals", () => {
    const changed = render([start], [{ ...start, groupCode: "TG02" }]);
    expect(changed).toContain("NIE301 TG01 → NIE301 TG02");
    expect(changed).not.toContain('aria-label="Added"');
    const unchanged = render([start], [start]);
    expect(unchanged).toContain("No class changes will be made.");
    expect(unchanged).toContain("1 other class remains unchanged.");
    expect(unchanged).not.toContain('aria-label="Removed"');
  });
});
