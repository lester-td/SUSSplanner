export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const FULL_START_HOUR = 8;
export const FULL_START_MINUTE = 30;
export const END_HOUR = 22;
export const FULL_START_MINUTES = FULL_START_HOUR * 60 + FULL_START_MINUTE;
export const FULL_END_MINUTES = END_HOUR * 60;

export const COOKIE_STATE = "timetableState";
export const WEEK_PATTERN_OPTIONS = ["all", "odd", "even"];
const API_DEFAULT_ORIGIN = "http://127.0.0.1:3000";
const RUNTIME_API_ORIGIN = typeof window !== "undefined" && window.location.port === "3000"
  ? ""
  : API_DEFAULT_ORIGIN;

export const API_BASE_URL = globalThis.SUSSPLANNER_API_BASE_URL || RUNTIME_API_ORIGIN;
export const MODULES_API_PATH = `${API_BASE_URL}/api/modules`;
export const MODULES_FALLBACK_PATH = "/backend/sampleModules.json";

export const MODULE_COLOR_PALETTE = [
  "#f47f7f",
  "#f59a6a",
  "#f4c663",
  "#9fbc9d",
  "#6cd0ca",
  "#749fd1",
  "#c49ace",
  "#d69078",
];
