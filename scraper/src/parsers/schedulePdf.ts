import { inferSemesterFromIsoDate, parseSingaporePdfDate, parseTime12h, semesterKeyString } from "../lib/dates.js";
import type {
  ClassEventRecord,
  ClassRecord,
  CourseRecord,
  EventKind,
  GroupCodeType,
  ScheduleParseResult,
  ScheduleType,
  SemesterKey
} from "../lib/types.js";

const COURSE_CODE_RE = "[A-Z]{2,5}[0-9]{3}[A-Z]?";
const GROUP_RE = "(?:CRN|TG)[0-9A-Z]{2,5}";
const DATE_RE = "\\d{1,2}\\/\\d{1,2}\\/\\d{4}";
const TIME_RE = "\\d{1,2}:\\d{2}(?::\\d{2})?\\s*[AP]M";

const KNOWN_MODES = [
  "VIRTUAL LABORATORY",
  "FACE-TO-FACE",
  "WRITTEN EXAM",
  "ONLINE EXAM",
  "ONLINE",
  "LABORATORY",
  "ECA",
  "TO BE ADVISED",
  "TBA"
];

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSchoolName(value: string): string {
  return value
    .replace(/\bPOSTGRADUATE\b/g, "")
    .replace(/\bSCHOOL\s*\/\s*CENTRE\b/g, "")
    .replace(/\bCOURSE CODE\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferEventKind(eventMode: string): EventKind {
  const upper = eventMode.toUpperCase();
  if (upper.includes("EXAM") || upper === "ECA" || upper.includes("END-OF-COURSE")) return "EXAM";
  return "CLASS";
}

function extractRemarksBetweenRows(text: string, rowEndIndex: number, nextRowStartIndex: number): string | null {
  const between = text.slice(rowEndIndex, nextRowStartIndex).trim();
  if (!between) return null;

  const cleaned = between
    .replace(/^(Yes|No|'?-|-)\s*/i, "")
    .replace(/\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b/gi, "")
    .replace(/Note: SUSS reserves.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function getAvailableAsGsp(rawAfterTimes: string): boolean | null {
  const match = rawAfterTimes.trim().match(/^(Yes|No|'?-|-)/i);
  if (!match) return null;
  const value = match[1].replace(/'/g, "").toUpperCase();
  if (value === "YES") return true;
  if (value === "NO" || value === "-" || value === "") return false;
  return null;
}

interface RawScheduleRow {
  postgraduateText: string | undefined;
  schoolName: string;
  courseCode: string;
  groupCode: string;
  mode: string;
  dateText: string;
  startText: string;
  endText: string;
  afterTimes: string;
  matchStart: number;
  matchEnd: number;
}

function parseRawRows(text: string): RawScheduleRow[] {
  const normalised = normaliseWhitespace(text);

  // Pattern supports the common SUSS schedule export shape:
  // [Yes/No postgraduate] [School/Centre] [Course Code] [CRN/TG] [Regular/Special] [Mode] [Date] [Start] [End] [Available flag / remarks]
  const rowRegex = new RegExp(
    `(?:(?<postgraduate>Yes|No)\\s+)?` +
    `(?<school>(?:SCHOOL|COLLEGE|CENTRE|INSTITUTE|S R NATHAN|NATHAN)[A-Z0-9&\\/\\- ,.'()]+?)\\s+` +
    `(?<course>${COURSE_CODE_RE})\\s+` +
    `(?<group>${GROUP_RE})\\s+` +
    `(?:Regular|Special)\\s+` +
    `(?<mode>[A-Z][A-Z0-9&\\/\\- ()]+?)\\s+` +
    `(?<date>${DATE_RE})\\s+` +
    `(?<start>${TIME_RE})\\s+` +
    `(?<end>${TIME_RE})` +
    `(?<after>.*?)` +
    `(?=(?:\\s+(?:Yes|No)\\s+)?(?:SCHOOL|COLLEGE|CENTRE|INSTITUTE|S R NATHAN|NATHAN)[A-Z0-9&\\/\\- ,.'()]+?\\s+${COURSE_CODE_RE}\\s+${GROUP_RE}\\s+(?:Regular|Special)\\s+|\\s+Note:|$)`,
    "gi"
  );

  const rows: RawScheduleRow[] = [];

  for (const match of normalised.matchAll(rowRegex)) {
    const groups = match.groups;
    if (!groups) continue;

    const rawMode = groups.mode.replace(/\s+/g, " ").trim();
    const mode = normaliseMode(rawMode);

    rows.push({
      postgraduateText: groups.postgraduate,
      schoolName: cleanSchoolName(groups.school),
      courseCode: groups.course.toUpperCase(),
      groupCode: groups.group.toUpperCase(),
      mode,
      dateText: groups.date,
      startText: groups.start,
      endText: groups.end,
      afterTimes: groups.after ?? "",
      matchStart: match.index ?? 0,
      matchEnd: (match.index ?? 0) + match[0].length
    });
  }

  return rows;
}

function normaliseMode(mode: string): string {
  const compact = mode.replace(/\s+/g, " ").trim().toUpperCase();

  for (const known of KNOWN_MODES) {
    if (compact.includes(known)) return known;
  }

  return compact;
}

function inferGroupCodeType(groupCode: string): GroupCodeType {
  return groupCode.toUpperCase().startsWith("TG") ? "TG" : "CRN";
}

export function parseSchedulePdfText(text: string, scheduleType: ScheduleType): ScheduleParseResult {
  const rawRows = parseRawRows(text);
  const warnings: string[] = [];

  if (rawRows.length === 0) {
    warnings.push("No schedule rows were parsed. Inspect data/output/*raw-text.txt and tune the regex for this PDF layout.");
  }

  const semesters = new Map<string, SemesterKey>();
  const courses = new Map<string, CourseRecord>();
  const classes = new Map<string, ClassRecord>();
  const classEvents: ClassEventRecord[] = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const row = rawRows[i];

    let eventDate: string;
    let startTime: string;
    let endTime: string;

    try {
      eventDate = parseSingaporePdfDate(row.dateText);
      startTime = parseTime12h(row.startText);
      endTime = parseTime12h(row.endText);
    } catch (error) {
      warnings.push(`Skipped row for ${row.courseCode} ${row.groupCode}: ${(error as Error).message}`);
      continue;
    }

    const semester = inferSemesterFromIsoDate(eventDate);
    semesters.set(semesterKeyString(semester), semester);

    const isPostgraduate = row.postgraduateText ? row.postgraduateText.toLowerCase() === "yes" : null;

    courses.set(row.courseCode, {
      courseCode: row.courseCode,
      courseName: null,
      schoolName: row.schoolName || null,
      isPostgraduate
    });

    const groupCodeType = inferGroupCodeType(row.groupCode);
    const classKey = [row.courseCode, semester.academicYear, semester.semesterNo, scheduleType, groupCodeType, row.groupCode].join("#");
    const availableAsGsp = getAvailableAsGsp(row.afterTimes);
    const remarks = extractRemarksBetweenRows(row.afterTimes, 0, row.afterTimes.length);

    if (!classes.has(classKey)) {
      classes.set(classKey, {
        courseCode: row.courseCode,
        academicYear: semester.academicYear,
        semesterNo: semester.semesterNo,
        scheduleType,
        groupCodeType,
        groupCode: row.groupCode,
        availableAsGsp,
        isRestricted: remarks?.toLowerCase().includes("restricted") ? true : null,
        remarks: null
      });
    }

    classEvents.push({
      courseCode: row.courseCode,
      academicYear: semester.academicYear,
      semesterNo: semester.semesterNo,
      scheduleType,
      groupCodeType,
      groupCode: row.groupCode,
      eventKind: inferEventKind(row.mode),
      eventDate,
      startTime,
      endTime,
      eventMode: row.mode,
      venue: null,
      remarks
    });
  }

  return {
    semesters: [...semesters.values()],
    courses: [...courses.values()],
    classes: [...classes.values()],
    classEvents,
    warnings
  };
}
