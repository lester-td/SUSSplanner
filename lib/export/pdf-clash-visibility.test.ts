import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { detectTimetableClashes } from "@/lib/timetable/clash-detection";
import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import { formatCampusNames, getEventCampusCodes } from "@/lib/timetable/campus";
import type { TimetableClash, TimetableData, TimetableEventRecord } from "@/lib/timetable/types";
import { getPdfClassSessionEvents } from "./class-sessions";

// Execute the actual caller bodies with their closure values supplied, without
// adding a browser test framework for two synchronous export handlers.
function sourceFunction(file: string, name: string): string
{
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node)
  {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error(`Missing ${name} in ${file}`);
  return ts.transpileModule(found.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
}

class TextElement
{
  textContent = "";
  className = "";
  children: TextElement[] = [];
  constructor(readonly ownerDocument: { createElement: () => TextElement }) {}
  appendChild(child: TextElement) { this.children.push(child); }
}
const buildListing = new Function("formatEventDate", "formatTimeRange", "formatCampusNames", "getEventCampusCodes",
  sourceFunction("./pdf-client.ts", "addTextElement") + sourceFunction("./pdf-client.ts", "buildEventListing") + "return buildEventListing;",
)(formatEventDate, formatTimeRange, formatCampusNames, getEventCampusCodes) as
  (doc: unknown, semester: null, events: TimetableEventRecord[], clashes: TimetableClash[]) => TextElement;

function event(id: number, code: string, startTime: string, endTime: string): TimetableEventRecord
{
  return { eventId: id, classId: id, courseCode: code, courseName: code, schoolName: null, shareKey: code,
    semesterId: 1, scheduleType: "evening", groupCodeType: "TG", groupCode: "TG01", eventKind: "CLASS",
    eventDate: "2026-10-05", dayOfWeek: 1, startTime, endTime, eventMode: null, campus: null, remarks: null,
    weekId: null, weekNo: null, weekType: null, weekLabel: null };
}
const abc = [event(1, "A", "09:00", "12:00"), event(2, "B", "10:00", "11:30"), event(3, "C", "11:00", "13:00")];
const unrelated = [event(4, "D", "15:00", "17:00"), event(5, "E", "16:00", "18:00")];

for (const caller of ["planner-client", "share-client"])
{
  describe(`${caller} PDF clash warnings`, () => {
    const handler = sourceFunction(`../../components/timetable/${caller}.tsx`, "handlePdfExport");
    it.each([
      { name: "A/C survive hiding B", events: abc, hidden: ["B"], groups: [["A", "C"]] },
      { name: "no hidden selections", events: abc, hidden: [], groups: [["A", "B", "C"], ["B", "C"]] },
      { name: "one visible selection", events: abc, hidden: ["A", "B"], groups: [] },
      { name: "all conflicting selections hidden", events: abc, hidden: ["A", "B", "C"], groups: [] },
      { name: "unrelated visible conflict survives", events: [...abc, ...unrelated], hidden: ["B"], groups: [["A", "C"], ["D", "E"]] },
      { name: "adjacent events do not overlap", events: [event(1, "A", "09:00", "10:00"), event(2, "C", "10:00", "11:00")], hidden: [], groups: [] },
      { name: "exam clashes retain their event semantics", events: abc.map(item => ({ ...item, eventKind: "EXAM" as const })), hidden: ["B"], groups: [["A", "C"]] },
      { name: "continuation selections retain distinct visibility", events: [abc[0], { ...abc[1], shareKey: "B@previous", originSemesterId: 0 }, abc[2]], hidden: ["B"], groups: [["A", "B", "C"], ["B", "C"]] },
    ])("$name", ({ events, hidden, groups }) => {
      const timetable: TimetableData = { semester: null, semesterWeeks: [], selections: [], unresolvedSelections: [],
        events, clashes: detectTimetableClashes(events),
        // Session-list-only spillovers must not become new clash inputs.
        classSessionEvents: [...events, { ...abc[0], eventId: 100, courseCode: "SPILL", shareKey: "SPILL" }] };
      const print = vi.fn(() => true);
      const scope = { canDownload: true, exportingFormat: null, viewMode: "class",
        exportCaptureRef: { current: {} }, alternateExportCaptureRef: { current: {} },
        setDownloadOpen: vi.fn(), setExportingFormat: vi.fn(), showPlannerBanner: vi.fn(),
        selectedSemester: null, timetableData: timetable, timetable, hiddenClasses: hidden,
        printTimetablePdf: print, getPdfClassSessionEvents, detectTimetableClashes,
        getTimetableExportFileName: () => "timetable.pdf" };
      new Function(...Object.keys(scope), handler + "handlePdfExport();")(...Object.values(scope));
      expect(print).toHaveBeenCalledOnce();
      const args = print.mock.calls[0] as unknown as [unknown, unknown, null, TimetableEventRecord[], TimetableClash[]];
      expect(args[3]).toEqual(getPdfClassSessionEvents(timetable, hidden));
      expect(args[4].map(clash => clash.events.map(item => item.courseCode))).toEqual(groups);
      const doc = { createElement: (): TextElement => new TextElement(doc) };
      const listing = buildListing(doc, null, args[3], args[4]);
      const warnings = listing.children.filter(child => child.className === "print-events__clash").map(child => child.textContent);
      expect(warnings).toHaveLength(groups.length);
      groups.forEach((group, index) => {
        for (const code of group) expect(warnings[index]).toContain(`${code} (TG01)`);
      });
      expect(args[4].flatMap(clash => clash.events).every(item => !hidden.includes(item.shareKey))).toBe(true);
    });
  });
}
