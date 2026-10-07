import type { ScheduleIntakes, ScheduleSourceType, SemesterKey } from "./types.js";

export interface ScheduleManifestItem {
  pdf?: string;
  csv?: string;
  scheduleType: ScheduleSourceType;
  intakes: ScheduleIntakes;
}

export interface ScheduleManifest {
  schedules: ScheduleManifestItem[];
}

export function validateScheduleSourceType(value: unknown): ScheduleSourceType {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "daytime" || value === "evening") return value;
  throw new Error("Schedule type must be 'auto', 'daytime', or 'evening'.");
}

export function parseScheduleIntakes(value: unknown): ScheduleIntakes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Specify source intakes, e.g. { regular: 'January 2027', special: 'May 2027' }.");
  }
  const input = value as Record<string, unknown>;
  const intakes: ScheduleIntakes = {};
  for (const key of Object.keys(input)) {
    if (key !== "regular" && key !== "special") throw new Error(`Unknown intake type '${key}'.`);
    const name = input[key];
    const match = typeof name === "string" ? /^(January|May|July) (20\d{2})$/.exec(name.trim()) : null;
    if (!match || (key === "special" ? match[1] !== "May" : match[1] === "May")) {
      throw new Error(`Invalid ${key} intake '${String(name)}': regular intakes use January/July YYYY; special intakes use May YYYY.`);
    }
    const year = Number(match[2]);
    const semesterNo: SemesterKey["semesterNo"] = match[1] === "July" ? 1 : match[1] === "January" ? 2 : 3;
    const startYear = semesterNo === 1 ? year : year - 1;
    intakes[key] = { academicYear: `${startYear}/${startYear + 1}`, semesterNo, semesterName: `${match[1]} ${year}` };
  }
  if (!intakes.regular && !intakes.special) throw new Error("Specify at least one source intake.");
  return intakes;
}

export function parseScheduleManifest(text: string): ScheduleManifest {
  const manifest: unknown = JSON.parse(text);
  if (!manifest || typeof manifest !== "object" || !("schedules" in manifest)
    || !Array.isArray(manifest.schedules) || manifest.schedules.length === 0) {
    throw new Error("Schedule manifest must contain a non-empty 'schedules' array.");
  }
  return {
    schedules: manifest.schedules.map((item: unknown, index: number) => {
      if (!item || typeof item !== "object") throw new Error(`Invalid schedule manifest entry ${index + 1}.`);
      const entry = item as Record<string, unknown>;
      for (const key of ["pdf", "csv"] as const) {
        if (entry[key] !== undefined && (typeof entry[key] !== "string" || !entry[key].trim())) {
          throw new Error(`Schedule manifest entry ${index + 1} requires a non-empty ${key} path.`);
        }
      }
      if (!entry.pdf && !entry.csv) throw new Error(`Schedule manifest entry ${index + 1} needs a PDF or CSV path.`);
      return {
        ...(entry.pdf ? { pdf: entry.pdf as string } : {}),
        ...(entry.csv ? { csv: entry.csv as string } : {}),
        scheduleType: validateScheduleSourceType(entry.scheduleType),
        intakes: parseScheduleIntakes(entry.intakes),
      };
    }),
  };
}
