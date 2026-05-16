export const FRONTEND_MODULE_COLOR_PALETTE = [
  "#f47f7f",
  "#f59a6a",
  "#f4c663",
  "#9fbc9d",
  "#6cd0ca",
  "#749fd1",
  "#c49ace",
  "#d69078",
];

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type FrontendLesson = {
  day: string;
  start: string;
  end: string;
  type: string;
  venue: string;
  weekPattern: "all" | "odd" | "even";
};

export type FrontendCatalogModule = {
  code: string;
  rootCode: string;
  tg: string;
  name: string;
  color: string;
  lessons: FrontendLesson[];
};

export function normalizeFrontendLessonType(type: string)
{
  const normalized = String(type || "").trim().toUpperCase();
  return normalized.includes("TUT") || normalized.includes("TUTORIAL")
    ? "TUT"
    : "LEC";
}

export function daySortValue(day: string)
{
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function sortFrontendLessons(lessons: FrontendLesson[])
{
  return [...lessons].sort((left, right) => {
    const dayDifference = daySortValue(left.day) - daySortValue(right.day);
    if (dayDifference !== 0)
    {
      return dayDifference;
    }

    return left.start.localeCompare(right.start);
  });
}

export function fallbackModuleColor(code: string)
{
  const normalized = String(code || "").trim().toUpperCase() || "MODULE";
  const hash = Math.abs(normalized.length + normalized.charCodeAt(0));
  return FRONTEND_MODULE_COLOR_PALETTE[hash % FRONTEND_MODULE_COLOR_PALETTE.length];
}
