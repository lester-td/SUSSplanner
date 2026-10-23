import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportComparison } from "@/components/timetable/import-comparison";
import { buildTimetableImportComparison } from "./import-comparison";
import type { SharedClassIdentifier } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const render = (saved: SharedClassIdentifier[], next: SharedClassIdentifier[], preserved: SharedClassIdentifier[] = []) => renderToStaticMarkup(createElement(ImportComparison, {
  comparison: buildTimetableImportComparison(saved, { selectedClasses: next, preservedSelections: preserved, skipped: [], canImport: true, tooManySelections: false }),
  semesters: [{ semesterId: 14, semesterName: "January 2027", academicYear: "2026/2027", semesterNo: 2 }],
}));

describe("import comparison labels", () => {
  it("shows only additions and removals, omitting kept and unchanged classes", () => {
    const link = { ...start, originSemesterId: 14 };
    const added = { ...start, courseCode: "ICT302" };
    const html = render([link, start], [link, added], [link]);
    expect(html).toContain('aria-label="Added"');
    expect(html).toContain('aria-label="Removed"');
    expect(html).not.toContain('aria-label="Kept"');
    expect(html).not.toContain("continuation from January 2027");
    expect(html).not.toContain("unchanged");
    expect(html).toContain("ICT302 TG01");
  });

  it("shows a group replacement as a removal and an addition", () => {
    const changed = render([start], [{ ...start, groupCode: "TG02" }]);
    const added = changed.split('aria-label="Added"')[1].split("</section>")[0];
    const removed = changed.split('aria-label="Removed"')[1].split("</section>")[0];
    expect(added).toContain("NIE301 TG02");
    expect(added).not.toContain("NIE301 TG01");
    expect(removed).toContain("NIE301 TG01");
    expect(removed).not.toContain("NIE301 TG02");
    expect(changed).not.toContain('aria-label="Changed"');
  });

  it("includes originating semesters when a continuation is removed", () => {
    expect(render([{ ...start, originSemesterId: 14 }], [])).toContain("continuation from January 2027");
  });

  it("leaves no-op messaging to the confirmation", () => {
    expect(render([start], [start])).toBe("");
  });
});
