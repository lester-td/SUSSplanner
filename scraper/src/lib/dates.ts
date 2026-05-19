import type { SemesterKey, SemesterNo } from "./types.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function parseSingaporePdfDate(input: string): string {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid date: ${input}`);

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function parseTime12h(input: string): string {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match) throw new Error(`Invalid time: ${input}`);

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const meridiem = match[4].toUpperCase();

  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`;
}

export function inferSemesterFromIsoDate(isoDate: string): SemesterKey {
  const [yearText, monthText] = isoDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  let semesterNo: SemesterNo;
  let academicStartYear: number;
  let displayMonth: string;

  if (month >= 8 && month <= 12) {
    semesterNo = 1;
    academicStartYear = year;
    displayMonth = "July";
  } else if (month >= 1 && month <= 4) {
    semesterNo = 2;
    academicStartYear = year - 1;
    displayMonth = "January";
  } else {
    semesterNo = 3;
    academicStartYear = year - 1;
    displayMonth = "May";
  }

  const academicYear = `${academicStartYear}/${academicStartYear + 1}`;
  const semesterName = `${displayMonth} ${year}`;

  return { academicYear, semesterNo, semesterName };
}

export function semesterKeyString(key: Pick<SemesterKey, "academicYear" | "semesterNo">): string {
  return `${key.academicYear}#${key.semesterNo}`;
}

export function monthNameFromIsoDate(isoDate: string): string {
  const month = Number(isoDate.split("-")[1]);
  return MONTH_NAMES[month - 1] ?? "Unknown";
}
