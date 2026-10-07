import { parse } from "csv-parse/sync";
import { parseSingaporePdfDate, parseTime12h, semesterKeyString } from "../lib/dates.js";
import { validateScheduleSourceType } from "../lib/scheduleManifest.js";
import type {
  ClassEventRecord,
  ClassRecord,
  CourseRecord,
  EventKind,
  GroupCodeType,
  ScheduleParseResult,
  ScheduleSourceType,
  ScheduleType,
  ScheduleIntakes,
  SemesterKey
} from "../lib/types.js";

const COURSE_CODE_RE = /^[A-Z]{2,5}[0-9]{3}[A-Z]{0,2}$/;
const GROUP_RE = /^(CRN|TG)[0-9A-Z]{2,5}$/;

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseHeader(value: string): string {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function boolFromYesNo(value: string): boolean | null {
  const upper = clean(value).replace(/'/g, "").toUpperCase();
  if (upper === "YES") return true;
  if (upper === "NO" || upper === "-" || upper === "") return false;
  return null;
}

function inferEventKind(eventMode: string): EventKind {
  const upper = eventMode.toUpperCase();
  if (upper.includes("EXAM") || upper === "ECA" || upper.includes("END-OF-COURSE")) return "EXAM";
  return "CLASS";
}

function inferGroupCodeType(groupCode: string): GroupCodeType {
  return groupCode.toUpperCase().startsWith("TG") ? "TG" : "CRN";
}

interface HeaderIndex {
  postgraduate: number;
  school: number;
  courseCode: number;
  groupCode: number;
  semesterType: number;
  language: number;
  eventMode: number;
  day: number;
  date: number;
  start: number;
  end: number;
  campus: number;
  availableAsGsp: number;
  remarks: number;
}

function getHeaderIndex(row: string[]): HeaderIndex | null {
  const headers = row.map(normaliseHeader);

  const find = (...needles: string[]) => headers.findIndex(header => needles.some(needle => header.includes(needle)));
  const idx: HeaderIndex = {
    postgraduate: find("POSTGRADUATE"),
    school: find("SCHOOL CENTRE", "SCHOOL"),
    courseCode: find("COURSE CODE"),
    groupCode: find("CRN TG", "CRN"),
    semesterType: find("SEMESTER TYPE"),
    language: find("LANGUAGE"),
    eventMode: find("DELIVERY EXAM MODE", "DELIVERY"),
    day: find("DAY"),
    date: find("DATE"),
    start: find("START"),
    end: find("END"),
    campus: find("CAMPUS", "VENUE"),
    availableAsGsp: find("AVAILABLE AS GSP100 UNE500", "AVAILABLE AS"),
    remarks: find("REMARKS")
  };

  if (idx.courseCode >= 0 && idx.groupCode >= 0 && idx.date >= 0 && idx.start >= 0 && idx.end >= 0) {
    return idx;
  }

  return null;
}

function cell(row: string[], index: number): string {
  if (index < 0) return "";
  return clean(row[index]);
}

export function parseScheduleCsv(csvText: string, sourceType: ScheduleSourceType = "auto", intakes: ScheduleIntakes = {}): ScheduleParseResult {
  const mode = validateScheduleSourceType(sourceType);
  const csvRows = parse(csvText, {
    relaxColumnCount: true,
    skipEmptyLines: true,
    bom: true
  }) as unknown[][];

  const rows = csvRows.map(row => row.map(clean));
  const warnings: string[] = [];
  const semesters = new Map<string, SemesterKey>();
  const courses = new Map<string, CourseRecord>();
  const classes = new Map<string, ClassRecord>();
  const classEvents: ClassEventRecord[] = [];

  let header: HeaderIndex | null = null;

  for (let rowNo = 0; rowNo < rows.length; rowNo += 1) {
    const row = rows[rowNo];
    const maybeHeader = getHeaderIndex(row);
    if (maybeHeader) {
      header = maybeHeader;
      continue;
    }

    if (!header) continue;

    const courseCode = cell(row, header.courseCode).toUpperCase();
    const groupCode = cell(row, header.groupCode).toUpperCase();
    const dateText = cell(row, header.date);
    const startText = cell(row, header.start);
    const endText = cell(row, header.end);

    if (!COURSE_CODE_RE.test(courseCode) || !GROUP_RE.test(groupCode)) continue;
    if (!dateText || !startText || !endText) {
      warnings.push(`Skipped row ${rowNo + 1}: missing date/start/end for ${courseCode} ${groupCode}`);
      continue;
    }

    let eventDate: string;
    let startTime: string;
    let endTime: string;

    try {
      eventDate = parseSingaporePdfDate(dateText);
      startTime = parseTime12h(startText);
      endTime = parseTime12h(endText);
    } catch (error) {
      warnings.push(`Skipped row ${rowNo + 1} (${courseCode} ${groupCode}): ${(error as Error).message}`);
      continue;
    }

    const intakeType = cell(row, header.semesterType).toLowerCase();
    if (intakeType !== "regular" && intakeType !== "special") {
      throw new Error(`Row ${rowNo + 1} (${courseCode} ${groupCode}) has an unknown SEMESTER TYPE '${intakeType}'. Expected Regular or Special.`);
    }
    const semester = intakes[intakeType];
    if (!semester) {
      throw new Error(`Missing ${intakeType} intake for row ${rowNo + 1} (${courseCode} ${groupCode}). Specify the source intake in the manifest or --${intakeType}-semester.`);
    }
    semesters.set(semesterKeyString(semester), semester);

    const eventMode = cell(row, header.eventMode).toUpperCase() || null;
    const schoolName = cell(row, header.school) || null;
    const isPostgraduate = boolFromYesNo(cell(row, header.postgraduate));
    const availableAsGsp = boolFromYesNo(cell(row, header.availableAsGsp));
    const remarks = cell(row, header.remarks) || null;
    const groupCodeType = inferGroupCodeType(groupCode);
    const scheduleType: ScheduleType = groupCodeType === "TG" ? "daytime" : "evening";
    if (mode !== "auto" && mode !== scheduleType) {
      throw new Error(`Row ${rowNo + 1} (${courseCode} ${groupCode}) is ${scheduleType}, but the source is marked ${mode}. Use 'auto' for a combined schedule.`);
    }

    const existingCourse = courses.get(courseCode);
    courses.set(courseCode, {
      ...existingCourse,
      courseCode,
      courseName: existingCourse?.courseName ?? null,
      schoolName: schoolName ?? existingCourse?.schoolName ?? null,
      isPostgraduate: isPostgraduate ?? existingCourse?.isPostgraduate ?? null
    });

    const classKey = [courseCode, semester.academicYear, semester.semesterNo, scheduleType, groupCodeType, groupCode].join("#");
    if (!classes.has(classKey)) {
      classes.set(classKey, {
        courseCode,
        academicYear: semester.academicYear,
        semesterNo: semester.semesterNo,
        scheduleType,
        groupCodeType,
        groupCode,
        language: cell(row, header.language).toUpperCase() || null,
        availableAsGsp,
        isRestricted: remarks?.toLowerCase().includes("restricted") ? true : null,
        remarks: null
      });
    }

    classEvents.push({
      courseCode,
      academicYear: semester.academicYear,
      semesterNo: semester.semesterNo,
      scheduleType,
      groupCodeType,
      groupCode,
      eventKind: inferEventKind(eventMode ?? ""),
      eventDate,
      startTime,
      endTime,
      eventMode,
      campus: cell(row, header.campus) || null,
      remarks
    });
  }

  if (classEvents.length === 0) {
    warnings.push("No schedule rows were parsed from CSV. Check the extracted CSV headers/columns.");
  }

  return {
    semesters: [...semesters.values()],
    courses: [...courses.values()],
    classes: [...classes.values()],
    classEvents,
    warnings
  };
}
