import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportComparison } from "@/components/timetable/import-comparison";
import { buildTimetableImportComparison, buildTimetableImportEffects } from "./import-comparison";
import { upsertClassInSavedTimetable } from "./local-storage";
import { buildTimetableImportProposal } from "./import-proposal";
import type { SharedClassIdentifier, TimetableData } from "./types";

const start: SharedClassIdentifier = { courseCode: "NIE301", scheduleType: "daytime", groupCodeType: "TG", groupCode: "TG01" };
const render = (saved: SharedClassIdentifier[], next: SharedClassIdentifier[]) => renderToStaticMarkup(createElement(ImportComparison, {
  comparison: buildTimetableImportComparison(saved, { selectedClasses: next }),
  semesters: [{ semesterId: 14, semesterName: "January 2027", academicYear: "2026/2027", semesterNo: 2 }],
}));

describe("import comparison labels", () => {
  it("shows only additions and removals, with origin labels for affected continuations", () => {
    const link = { ...start, originSemesterId: 14 };
    const html = render([link, start], [{ ...link, groupCode: "TG02" }, start]);
    expect(html).toContain('aria-label="Added"');
    expect(html).toContain('aria-label="Removed"');
    expect(html).toContain("continuation from January 2027");
    expect(html).toContain("NIE301 TG01");
    expect(html).toContain("NIE301 TG02");
    for (const text of ["Kept", "Changed", "unchanged", "→"]) expect(html).not.toContain(text);
  });

  it("renders no sections for a true no-op", () => {
    const html = render([start], [start]);
    expect(html).not.toContain("section");
    expect(html).not.toContain("NIE301");
  });

  it("counts continuation-only changes, showing only affected semesters", () => {
    const current = upsertClassInSavedTimetable(null, 14, start, [15]);
    const incomingTimetable = { selections: [{ identifier: start, continuationSemesterIds: [16] }] } as TimetableData;
    const proposal = buildTimetableImportProposal({ current, incoming: { semesterId: 14, selectedClasses: [start] }, incomingTimetable,
      savedTimetable: null, continuationTimetables: new Map([[16, { selections: [{ identifier: { ...start, originSemesterId: 14 } }] } as TimetableData]]),
    });
    expect(buildTimetableImportEffects(current, proposal.projectedState)).toMatchObject({
      hasChanges: true, resetsView: false, semesters: [
        { semesterId: 15, comparison: { added: [], removed: [{ ...start, originSemesterId: 14 }] } },
        { semesterId: 16, comparison: { added: [{ ...start, originSemesterId: 14 }], removed: [] } },
      ],
    });
    const unchanged = buildTimetableImportProposal({ current, incoming: { semesterId: 14, selectedClasses: [start] },
      incomingTimetable: { selections: [{ identifier: start, continuationSemesterIds: [15] }] } as TimetableData,
      savedTimetable: null, continuationTimetables: new Map([[15, { selections: [{ identifier: { ...start, originSemesterId: 14 } }] } as TimetableData]]),
    });
    expect(buildTimetableImportEffects(current, unchanged.projectedState)).toEqual({ hasChanges: false, resetsView: false, semesters: [] });
  });
});
