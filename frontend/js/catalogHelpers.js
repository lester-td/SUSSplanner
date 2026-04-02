import { DAYS, WEEK_PATTERN_OPTIONS, MODULE_COLOR_PALETTE } from "./constants.js";

export function isValidLesson(lesson)
{
  if (!lesson || typeof lesson !== "object")
  {
    return false;
  }

  const validDay = DAYS.includes(lesson.day);
  const validStart = /^\d{4}$/.test(String(lesson.start || ""));
  const validEnd = /^\d{4}$/.test(String(lesson.end || ""));
  const validPattern = WEEK_PATTERN_OPTIONS.includes(String(lesson.weekPattern || "all"));
  return validDay && validStart && validEnd && validPattern;
}

export function sanitizeModuleCatalog(rawModules)
{
  if (!Array.isArray(rawModules))
  {
    return [];
  }

  return rawModules
    .map((moduleData) => {
      if (!moduleData || typeof moduleData !== "object")
      {
        return null;
      }

      const code = String(moduleData.code || "").trim().toUpperCase();
      if (!code)
      {
        return null;
      }
      const rootCode = code.replace(/-TG\d+$/i, "");
      const name = String(moduleData.name || rootCode).trim() || rootCode;

      const color = MODULE_COLOR_PALETTE.includes(String(moduleData.color || "").toLowerCase())
        ? String(moduleData.color).toLowerCase()
        : MODULE_COLOR_PALETTE[Math.abs(code.length + code.charCodeAt(0)) % MODULE_COLOR_PALETTE.length];

      const lessons = Array.isArray(moduleData.lessons)
        ? moduleData.lessons
            .filter(isValidLesson)
            .map((lesson) => ({
              day: lesson.day,
              start: String(lesson.start),
              end: String(lesson.end),
              type: "Class",
              venue: String(lesson.venue || "TBA").trim() || "TBA",
              weekPattern: String(lesson.weekPattern || "all").toLowerCase(),
            }))
        : [];

      if (lessons.length === 0)
      {
        return null;
      }

      return {
        code,
        name,
        color,
        lessons,
      };
    })
    .filter(Boolean);
}
