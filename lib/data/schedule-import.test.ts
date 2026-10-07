import { describe, expect, it } from "vitest";
import { parseScheduleCsv as parseSourceCsv } from "../../scraper/src/parsers/scheduleCsv";
import { generateSql } from "../../scraper/src/sql/generateSql";
import { parseScheduleIntakes, parseScheduleManifest, validateScheduleSourceType } from "../../scraper/src/lib/scheduleManifest";

const intakes = parseScheduleIntakes({ regular: "January 2027", special: "May 2027" });
const parseScheduleCsv = (csv: string, mode: Parameters<typeof parseSourceCsv>[1] = "auto",
  sourceIntakes = intakes) => parseSourceCsv(csv, mode, sourceIntakes);

function scheduleCsv(locationHeader: string | null, language?: string)
{
  return [
    ["POSTGRADUATE", "SCHOOL / CENTRE", "COURSE CODE", "CRN / TG", "SEMESTER TYPE",
      ...(language ? ["LANGUAGE"] : []),
      "DELIVERY / EXAM MODE", "DATE", "START", "END", ...(locationHeader ? [locationHeader] : []),
      "AVAILABLE AS GSP100/UNE500", "REMARKS"].join(","),
    ["No", "SCHOOL OF BUSINESS", "ACC201", "CRN01", "Regular", ...(language ? [language] : []), "FACE-TO-FACE",
      "12/01/2027", "07:00:00 PM", "10:00:00 PM", ...(locationHeader ? ["CLE"] : []), "Yes", ""].join(","),
    ["No", "SCHOOL OF BUSINESS", "ACC201", "CRN01", "Regular", ...(language ? [language] : []), "ONLINE",
      "19/01/2027", "07:00:00 PM", "10:00:00 PM", ...(locationHeader ? ["ONL"] : []), "Yes", ""].join(","),
  ].join("\n");
}

describe("schedule campus import", () => {
  it.each(["CAMPUS", "VENUE"])("preserves each session's location from a %s column through SQL generation", header => {
    const result = parseScheduleCsv(scheduleCsv(header), "evening");
    expect(result.warnings).toEqual([]);
    expect(result.classes).toHaveLength(1);
    expect(result.classEvents.map(event => [event.eventMode, event.campus])).toEqual([
      ["FACE-TO-FACE", "CLE"], ["ONLINE", "ONL"],
    ]);
    const sql = generateSql(result);
    expect(sql).toContain("event_mode, campus, remarks");
    expect(sql).toContain("'CLE'");
    expect(sql).toContain("'ONL'");
    expect(sql).not.toContain("venue");
  });

  it("imports older schedules without a location column with a null campus", () => {
    const result = parseScheduleCsv(scheduleCsv(null), "evening");
    expect(result.warnings).toEqual([]);
    expect(result.classEvents).toHaveLength(2);
    expect(result.classEvents.every(event => event.campus === null)).toBe(true);
    expect(result.classes[0].language).toBeNull();
  });

  it("stores language of instruction on the offering and includes it in class upserts", () => {
    const result = parseScheduleCsv(scheduleCsv("CAMPUS", " Chinese "), "evening");
    expect(result.warnings).toEqual([]);
    expect(result.classes[0].language).toBe("CHINESE");
    const sql = generateSql(result);
    expect(sql).toContain("'CHINESE'");
    expect(sql).toContain("language = COALESCE(EXCLUDED.language, classes.language)");
  });
});

describe("combined daytime and evening imports", () => {
  const mixedCsv = [
    scheduleCsv("CAMPUS", "English"),
    // Daytime sessions can occur in the evening; group code determines the type.
    ...scheduleCsv("CAMPUS", "Chinese").replaceAll("CRN01", "TG01").split("\n").slice(1),
  ].join("\n");

  it.each([undefined, "auto"] as const)("classifies each row with mode %s without duplicating offerings", mode => {
    const result = parseScheduleCsv(mixedCsv, mode);
    expect(result.warnings).toEqual([]);
    expect(result.courses).toHaveLength(1);
    expect(result.classes.map(group => [group.groupCode, group.scheduleType, group.language])).toEqual([
      ["CRN01", "evening", "ENGLISH"], ["TG01", "daytime", "CHINESE"],
    ]);
    expect(result.classEvents).toHaveLength(4);
    expect(result.classEvents.every(event => event.scheduleType === (event.groupCodeType === "TG" ? "daytime" : "evening"))).toBe(true);
    const sql = generateSql(result);
    expect(sql).toContain("'daytime'");
    expect(sql).toContain("'evening'");
    expect(sql).not.toContain("'auto'");
  });

  it.each(["daytime", "evening"] as const)("rejects a combined file incorrectly marked %s", mode => {
    expect(() => parseScheduleCsv(mixedCsv, mode)).toThrow("Use 'auto' for a combined schedule");
  });

  it("supports older separate files with explicit types", () => {
    expect(parseScheduleCsv(scheduleCsv("CAMPUS"), "evening").classes[0].scheduleType).toBe("evening");
    expect(parseScheduleCsv(scheduleCsv("CAMPUS").replaceAll("CRN01", "TG01"), "daytime").classes[0].scheduleType).toBe("daytime");
  });

  it("keeps CRN sessions classified as evening even when their exam is in the morning", () => {
    const csv = scheduleCsv("CAMPUS").replaceAll("07:00:00 PM", "09:00:00 AM").replaceAll("10:00:00 PM", "12:00:00 PM");
    expect(parseScheduleCsv(csv).classEvents.every(event => event.scheduleType === "evening")).toBe(true);
  });

  it("imports courses with a two-letter suffix found in the combined PDF", () => {
    const result = parseScheduleCsv(scheduleCsv("CAMPUS").replaceAll("ACC201", "CDO303SU"));
    expect(result.courses[0].courseCode).toBe("CDO303SU");
    expect(result.classes[0].scheduleType).toBe("evening");
    expect(result.classEvents).toHaveLength(2);
    expect(generateSql(result)).toContain("'CDO303SU'");
  });
});

describe("schedule manifest import modes", () => {
  it("defaults each source independently and supports a mix of old and combined files", () => {
    const manifest = parseScheduleManifest(JSON.stringify({ schedules: [
      { pdf: "combined.pdf", intakes: { regular: "January 2027", special: "May 2027" } },
      { csv: "combined.csv", scheduleType: "auto", intakes: { regular: "January 2027" } },
      { pdf: "old-daytime.pdf", scheduleType: "daytime", intakes: { regular: "July 2026" } },
      { pdf: "old-evening.pdf", scheduleType: "evening", intakes: { regular: "January 2026" } },
    ] }));
    expect(manifest.schedules.map(item => item.scheduleType)).toEqual(["auto", "auto", "daytime", "evening"]);
  });

  it.each(["mixed", "", null, true])("rejects unsupported mode %s rather than writing it into database records", mode => {
    expect(() => validateScheduleSourceType(mode)).toThrow("Schedule type must");
    expect(() => parseScheduleManifest(JSON.stringify({ schedules: [{ pdf: "test.pdf", scheduleType: mode }] }))).toThrow("Schedule type must");
  });

  it.each([{}, { schedules: [] }, { schedules: [{}] }, { schedules: [{ pdf: "" }] }, { schedules: [null] }])(
    "rejects an unusable manifest: %j", manifest => {
      expect(() => parseScheduleManifest(JSON.stringify(manifest))).toThrow();
    },
  );
});


describe("offering intake ownership", () => {
  const header = "COURSE CODE,CRN / TG,SEMESTER TYPE,LANGUAGE,DELIVERY / EXAM MODE,DATE,START,END,CAMPUS";
  const row = (code: string, group: string, type: string, date: string) =>
    `${code},${group},${type},ENGLISH,FACE-TO-FACE,${date},07:00:00 PM,10:00:00 PM,CLE`;

  it("keeps August completion on the May offering, even when CSV dates are out of order", () => {
    const csv = [header, row("NIE351", "CRN06", "Special", "21/08/2027"), row("NIE351", "CRN06", "Special", "14/05/2027")].join("\n");
    const result = parseScheduleCsv(csv);
    expect(result.semesters).toEqual([intakes.special]);
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toMatchObject({ academicYear: "2026/2027", semesterNo: 3 });
    expect(result.classEvents.map(event => [event.semesterNo, event.eventDate])).toEqual([
      [3, "2027-08-21"], [3, "2027-05-14"],
    ]);
    const sql = generateSql(result);
    expect(sql).toContain("DATE '2027-08-21'");
    expect(sql).not.toContain("'July 2027'");
  });

  it("keeps November/December pre-term sessions on the declared January intake", () => {
    const result = parseScheduleCsv([header,
      row("CDO355", "CRN02", "Regular", "23/11/2026"),
      row("CDO355", "CRN02", "Regular", "13/12/2026"),
      row("CDO355", "CRN02", "Regular", "03/01/2027"),
    ].join("\n"));
    expect(result.semesters).toEqual([intakes.regular]);
    expect(result.classes).toHaveLength(1);
    expect(result.classEvents.every(event => event.academicYear === "2026/2027" && event.semesterNo === 2)).toBe(true);
    expect(result.classEvents.map(event => event.eventDate)).toEqual(["2026-11-23", "2026-12-13", "2027-01-03"]);
  });

  it("separates Regular and Special intakes that reuse the same course and group", () => {
    const result = parseScheduleCsv([header,
      row("NIE351", "CRN01", "Regular", "11/01/2027"),
      row("NIE351", "CRN01", "Regular", "21/08/2027"),
      row("NIE351", "CRN01", "Special", "14/05/2027"),
      row("NIE351", "CRN01", "Special", "22/08/2027"),
    ].join("\n"));
    expect(result.classes.map(group => group.semesterNo)).toEqual([2, 3]);
    expect(result.classEvents.map(event => event.semesterNo)).toEqual([2, 2, 3, 3]);
  });

  it("does not infer ownership when an intake is missing or the semester type is unknown", () => {
    expect(() => parseSourceCsv(scheduleCsv("CAMPUS"))).toThrow("Missing regular intake");
    const special = [header, row("NIE351", "CRN06", "Special", "21/08/2027")].join("\n");
    expect(() => parseScheduleCsv(special, "auto", { regular: intakes.regular })).toThrow("Missing special intake");
    expect(() => parseScheduleCsv(special.replace("Special", "Unknown"))).toThrow("unknown SEMESTER TYPE");
  });

  it.each([
    undefined, {}, { regular: "May 2027" }, { special: "January 2027" },
    { regular: "January27" }, { regular: "January 2027", autumn: "July 2027" },
  ])("rejects ambiguous or incompatible intake metadata: %j", value => {
    expect(() => parseScheduleIntakes(value)).toThrow();
  });

  it("requires intake metadata in production manifests", () => {
    expect(() => parseScheduleManifest(JSON.stringify({ schedules: [{ pdf: "schedule.pdf" }] }))).toThrow("Specify source intakes");
    expect(parseScheduleIntakes({ regular: "July 2027" }).regular).toEqual({
      academicYear: "2027/2028", semesterNo: 1, semesterName: "July 2027",
    });
  });
});
