import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseScheduleCsv as parseSourceCsv } from "./scheduleCsv.js";
import { generateSql } from "../sql/generateSql.js";
import { parseScheduleIntakes, parseScheduleManifest, validateScheduleSourceType } from "../lib/scheduleManifest.js";

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
  for (const header of ["CAMPUS", "VENUE"]) {
    it(`preserves each session's location from a ${header} column through SQL generation`, () => {
      const result = parseScheduleCsv(scheduleCsv(header), "evening");
      assert.deepEqual(result.warnings, []);
      assert.equal(result.classes.length, 1);
      assert.deepEqual(result.classEvents.map(event => [event.eventMode, event.campus]), [
        ["FACE-TO-FACE", "CLE"], ["ONLINE", "ONL"],
      ]);
      const sql = generateSql(result);
      assert.ok(sql.includes("event_mode, campus, remarks"));
      assert.ok(sql.includes("'CLE'"));
      assert.ok(sql.includes("'ONL'"));
      assert.ok(!sql.includes("venue"));
    });
  }

  it("imports older schedules without a location column with a null campus", () => {
    const result = parseScheduleCsv(scheduleCsv(null), "evening");
    assert.deepEqual(result.warnings, []);
    assert.equal(result.classEvents.length, 2);
    assert.ok(result.classEvents.every(event => event.campus === null));
    assert.equal(result.classes[0].language, null);
  });

  it("stores language of instruction on the offering and includes it in class upserts", () => {
    const result = parseScheduleCsv(scheduleCsv("CAMPUS", " Chinese "), "evening");
    assert.deepEqual(result.warnings, []);
    assert.equal(result.classes[0].language, "CHINESE");
    const sql = generateSql(result);
    assert.ok(sql.includes("'CHINESE'"));
    assert.ok(sql.includes("language = COALESCE(EXCLUDED.language, classes.language)"));
  });
});

describe("combined daytime and evening imports", () => {
  const mixedCsv = [
    scheduleCsv("CAMPUS", "English"),
    // Daytime sessions can occur in the evening; group code determines the type.
    ...scheduleCsv("CAMPUS", "Chinese").replaceAll("CRN01", "TG01").split("\n").slice(1),
  ].join("\n");

  for (const mode of [undefined, "auto"] as const) {
    it(`classifies each row with mode ${mode} without duplicating offerings`, () => {
      const result = parseScheduleCsv(mixedCsv, mode);
      assert.deepEqual(result.warnings, []);
      assert.equal(result.courses.length, 1);
      assert.deepEqual(result.classes.map(group => [group.groupCode, group.scheduleType, group.language]), [
        ["CRN01", "evening", "ENGLISH"], ["TG01", "daytime", "CHINESE"],
      ]);
      assert.equal(result.classEvents.length, 4);
      assert.ok(result.classEvents.every(event => event.scheduleType === (event.groupCodeType === "TG" ? "daytime" : "evening")));
      const sql = generateSql(result);
      assert.ok(sql.includes("'daytime'"));
      assert.ok(sql.includes("'evening'"));
      assert.ok(!sql.includes("'auto'"));
    });
  }

  for (const mode of ["daytime", "evening"] as const) {
    it(`rejects a combined file incorrectly marked ${mode}`, () => {
      assert.throws(() => parseScheduleCsv(mixedCsv, mode), /Use 'auto' for a combined schedule/);
    });
  }

  it("supports older separate files with explicit types", () => {
    assert.equal(parseScheduleCsv(scheduleCsv("CAMPUS"), "evening").classes[0].scheduleType, "evening");
    assert.equal(parseScheduleCsv(scheduleCsv("CAMPUS").replaceAll("CRN01", "TG01"), "daytime").classes[0].scheduleType, "daytime");
  });

  it("keeps CRN sessions classified as evening even when their exam is in the morning", () => {
    const csv = scheduleCsv("CAMPUS").replaceAll("07:00:00 PM", "09:00:00 AM").replaceAll("10:00:00 PM", "12:00:00 PM");
    assert.ok(parseScheduleCsv(csv).classEvents.every(event => event.scheduleType === "evening"));
  });

  it("imports courses with a two-letter suffix found in the combined PDF", () => {
    const result = parseScheduleCsv(scheduleCsv("CAMPUS").replaceAll("ACC201", "CDO303SU"));
    assert.equal(result.courses[0].courseCode, "CDO303SU");
    assert.equal(result.classes[0].scheduleType, "evening");
    assert.equal(result.classEvents.length, 2);
    assert.ok(generateSql(result).includes("'CDO303SU'"));
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
    assert.deepEqual(manifest.schedules.map(item => item.scheduleType), ["auto", "auto", "daytime", "evening"]);
  });

  for (const mode of ["mixed", "", null, true]) {
    it(`rejects unsupported mode ${JSON.stringify(mode)} rather than writing it into database records`, () => {
      assert.throws(() => validateScheduleSourceType(mode), /Schedule type must/);
      assert.throws(() => parseScheduleManifest(JSON.stringify({ schedules: [{ pdf: "test.pdf", scheduleType: mode }] })), /Schedule type must/);
    });
  }

  for (const manifest of [{}, { schedules: [] }, { schedules: [{}] }, { schedules: [{ pdf: "" }] }, { schedules: [null] }]) {
    it(`rejects an unusable manifest: ${JSON.stringify(manifest)}`, () => {
      assert.throws(() => parseScheduleManifest(JSON.stringify(manifest)));
    });
  }
});

describe("offering intake ownership", () => {
  const header = "COURSE CODE,CRN / TG,SEMESTER TYPE,LANGUAGE,DELIVERY / EXAM MODE,DATE,START,END,CAMPUS";
  const row = (code: string, group: string, type: string, date: string) =>
    `${code},${group},${type},ENGLISH,FACE-TO-FACE,${date},07:00:00 PM,10:00:00 PM,CLE`;

  it("keeps August completion on the May offering, even when CSV dates are out of order", () => {
    const csv = [header, row("NIE351", "CRN06", "Special", "21/08/2027"), row("NIE351", "CRN06", "Special", "14/05/2027")].join("\n");
    const result = parseScheduleCsv(csv);
    assert.deepEqual(result.semesters, [intakes.special]);
    assert.equal(result.classes.length, 1);
    assert.equal(result.classes[0].academicYear, "2026/2027");
    assert.equal(result.classes[0].semesterNo, 3);
    assert.deepEqual(result.classEvents.map(event => [event.semesterNo, event.eventDate]), [
      [3, "2027-08-21"], [3, "2027-05-14"],
    ]);
    const sql = generateSql(result);
    assert.ok(sql.includes("DATE '2027-08-21'"));
    assert.ok(!sql.includes("'July 2027'"));
  });

  it("keeps November/December pre-term sessions on the declared January intake", () => {
    const result = parseScheduleCsv([header,
      row("CDO355", "CRN02", "Regular", "23/11/2026"),
      row("CDO355", "CRN02", "Regular", "13/12/2026"),
      row("CDO355", "CRN02", "Regular", "03/01/2027"),
    ].join("\n"));
    assert.deepEqual(result.semesters, [intakes.regular]);
    assert.equal(result.classes.length, 1);
    assert.ok(result.classEvents.every(event => event.academicYear === "2026/2027" && event.semesterNo === 2));
    assert.deepEqual(result.classEvents.map(event => event.eventDate), ["2026-11-23", "2026-12-13", "2027-01-03"]);
  });

  it("separates Regular and Special intakes that reuse the same course and group", () => {
    const result = parseScheduleCsv([header,
      row("NIE351", "CRN01", "Regular", "11/01/2027"),
      row("NIE351", "CRN01", "Regular", "21/08/2027"),
      row("NIE351", "CRN01", "Special", "14/05/2027"),
      row("NIE351", "CRN01", "Special", "22/08/2027"),
    ].join("\n"));
    assert.deepEqual(result.classes.map(group => group.semesterNo), [2, 3]);
    assert.deepEqual(result.classEvents.map(event => event.semesterNo), [2, 2, 3, 3]);
  });

  it("does not infer ownership when an intake is missing or the semester type is unknown", () => {
    assert.throws(() => parseSourceCsv(scheduleCsv("CAMPUS")), /Missing regular intake/);
    const special = [header, row("NIE351", "CRN06", "Special", "21/08/2027")].join("\n");
    assert.throws(() => parseScheduleCsv(special, "auto", { regular: intakes.regular }), /Missing special intake/);
    assert.throws(() => parseScheduleCsv(special.replace("Special", "Unknown")), /unknown SEMESTER TYPE/);
  });

  for (const value of [
    undefined, {}, { regular: "May 2027" }, { special: "January 2027" },
    { regular: "January27" }, { regular: "January 2027", autumn: "July 2027" },
  ]) {
    it(`rejects ambiguous or incompatible intake metadata: ${JSON.stringify(value)}`, () => {
      assert.throws(() => parseScheduleIntakes(value));
    });
  }

  it("requires intake metadata in production manifests", () => {
    assert.throws(() => parseScheduleManifest(JSON.stringify({ schedules: [{ pdf: "schedule.pdf" }] })), /Specify source intakes/);
    assert.deepEqual(parseScheduleIntakes({ regular: "July 2027" }).regular, {
      academicYear: "2027/2028", semesterNo: 1, semesterName: "July 2027",
    });
  });
});
