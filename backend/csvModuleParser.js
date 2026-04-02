const MODULE_COLOR_PALETTE = [
  "#84cc16",
  "#38bdf8",
  "#fbbf24",
  "#f97316",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#14b8a6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#6366f1",
  "#0ea5e9",
  "#eab308",
  "#64748b",
];

const CSV_REQUIRED_COLUMNS = ["COURSE CODE", "CRN / TG", "DAY", "DATE", "START", "END"];
const CSV_DAY_MAP = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
  SUNDAY: "Sun",
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

function getIsoWeekNumber(date)
{
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

function paletteColorForCode(code)
{
  let hash = 0;
  String(code).split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  });
  return MODULE_COLOR_PALETTE[Math.abs(hash) % MODULE_COLOR_PALETTE.length];
}

function parseCsvLine(line)
{
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let idx = 0; idx < line.length; idx += 1)
  {
    const char = line[idx];
    if (char === '"')
    {
      const isEscapedQuote = inQuotes && line[idx + 1] === '"';
      if (isEscapedQuote)
      {
        current += '"';
        idx += 1;
      }
      else
      {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes)
    {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvTime(value)
{
  const text = String(value || "").trim();
  const matched = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!matched)
  {
    return "";
  }

  let hours = Number(matched[1]);
  const mins = matched[2];
  const meridian = matched[3] ? matched[3].toUpperCase() : "";

  if (meridian)
  {
    if (meridian === "PM" && hours !== 12)
    {
      hours += 12;
    }
    if (meridian === "AM" && hours === 12)
    {
      hours = 0;
    }
  }

  return `${String(hours).padStart(2, "0")}${mins}`;
}

function parseCsvDate(value)
{
  const matched = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!matched)
  {
    return null;
  }

  const day = Number(matched[1]);
  const month = Number(matched[2]) - 1;
  const year = Number(matched[3]);
  const parsed = new Date(year, month, day);
  if (Number.isNaN(parsed.getTime()))
  {
    return null;
  }
  return parsed;
}

function normalizeCsvDay(value)
{
  const key = String(value || "").trim().toUpperCase();
  return CSV_DAY_MAP[key] || "";
}

function weekParityForDates(dateSet)
{
  const parity = new Set();
  dateSet.forEach((date) => {
    const weekNumber = getIsoWeekNumber(date);
    parity.add(weekNumber % 2 === 1 ? "odd" : "even");
  });

  if (parity.size === 1)
  {
    return [...parity][0];
  }
  return "all";
}

function parseModulesFromCsvText(csvText)
{
  const lines = String(csvText || "")
    .replace(/\uFEFF/g, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const headerRowIndex = lines.findIndex((line) => line.toUpperCase().includes("COURSE CODE") && line.toUpperCase().includes("CRN / TG"));
  if (headerRowIndex === -1)
  {
    throw new Error("CSV header row not found.");
  }

  const headerCells = parseCsvLine(lines[headerRowIndex]);
  const headerMap = new Map();
  headerCells.forEach((header, index) => {
    headerMap.set(header.trim().toUpperCase(), index);
  });

  const missingColumns = CSV_REQUIRED_COLUMNS.filter((column) => !headerMap.has(column));
  if (missingColumns.length > 0)
  {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const entryMap = new Map();
  for (let idx = headerRowIndex + 1; idx < lines.length; idx += 1)
  {
    const row = parseCsvLine(lines[idx]);
    const getValue = (column) => row[headerMap.get(column)] || "";

    const courseCode = getValue("COURSE CODE").trim().toUpperCase();
    const groupCode = getValue("CRN / TG").trim().toUpperCase();
    const day = normalizeCsvDay(getValue("DAY"));
    const start = parseCsvTime(getValue("START"));
    const end = parseCsvTime(getValue("END"));
    const date = parseCsvDate(getValue("DATE"));

    if (!courseCode || !groupCode || !day || !start || !end || !date)
    {
      continue;
    }

    const moduleCode = `${courseCode}-${groupCode}`;
    const delivery = getValue("DELIVERY / EXAM MODE").trim();
    const school = getValue("SCHOOL / CENTRE").trim();
    const venue = delivery || school || "TBA";
    const courseName = getValue("COURSE TITLE").trim() || getValue("COURSE NAME").trim() || courseCode;
    const entryKey = `${moduleCode}|${day}|${start}|${end}`;

    if (!entryMap.has(entryKey))
    {
      entryMap.set(entryKey, {
        moduleCode,
        moduleName: courseName,
        day,
        start,
        end,
        type: groupCode,
        venue,
        dates: new Set(),
      });
    }

    entryMap.get(entryKey).dates.add(date);
  }

  const modulesMap = new Map();
  entryMap.forEach((entry) => {
    if (!modulesMap.has(entry.moduleCode))
    {
      modulesMap.set(entry.moduleCode, {
        code: entry.moduleCode,
        name: entry.moduleName,
        color: paletteColorForCode(entry.moduleCode),
        lessons: [],
      });
    }

    modulesMap.get(entry.moduleCode).lessons.push({
      day: entry.day,
      start: entry.start,
      end: entry.end,
      type: "Class",
      venue: entry.venue,
      weekPattern: weekParityForDates(entry.dates),
    });
  });

  const modules = [...modulesMap.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (modules.length === 0)
  {
    throw new Error("No valid timetable rows found in CSV.");
  }

  return modules;
}

module.exports = {
  parseModulesFromCsvText,
};
