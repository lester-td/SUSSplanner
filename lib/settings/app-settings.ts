import { COURSE_COLOR_PALETTE } from "@/lib/timetable/timetable-utils";
import type { TimetableOrientation, TimetableStudyMode } from "@/lib/timetable/types";

export type ColorSchemePreference = "system" | "light" | "dark";

export type RegistrationReminderPreferences = {
  enabled: boolean;
};

export type SettingsState = {
  colorScheme: ColorSchemePreference;
  themeId: string;
  timetableOrientation: TimetableOrientation;
  registrationReminders: RegistrationReminderPreferences;
  timetableStudyMode: TimetableStudyMode;
};

export type ThemeOption = {
  id: string;
  name: string;
  colors: readonly string[];
};

export const APP_SETTINGS_STORAGE_KEY = "sussplanner:settings";
export const APP_SETTINGS_UPDATED_EVENT = "sussplanner:settings-updated";

export const DEFAULT_REGISTRATION_REMINDER_PREFERENCES: RegistrationReminderPreferences = {
  enabled: true,
};

export const DEFAULT_APP_SETTINGS: SettingsState = {
  colorScheme: "system",
  themeId: "current-timetable",
  timetableOrientation: "horizontal",
  registrationReminders: DEFAULT_REGISTRATION_REMINDER_PREFERENCES,
  timetableStudyMode: "full-time",
};

export const APP_THEME_OPTIONS: ThemeOption[] = [
  {
    id: "current-timetable",
    name: "Default",
    colors: COURSE_COLOR_PALETTE,
  },
  {
    id: "suss-brand",
    name: "SUSS Brand",
    colors: ["#001E60", "#DA291C", "#9ADBE8", "#D0DF00", "#7B87B8", "#F08A81", "#D6D2C4", "#B8E9F1"],
  },
  {
    id: "focus",
    name: "Focus",
    colors: ["#172554", "#1D4ED8", "#2563EB", "#0891B2", "#475569", "#64748B", "#94A3B8", "#CBD5E1"],
  },
  {
    id: "bright",
    name: "Bright",
    colors: ["#164E63", "#0D9488", "#84CC16", "#FACC15", "#F97316", "#E11D48", "#9333EA", "#2563EB"],
  },
];

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isColorSchemePreference(value: unknown): value is ColorSchemePreference
{
  return value === "system" || value === "light" || value === "dark";
}

function isTimetableOrientation(value: unknown): value is TimetableOrientation
{
  return value === "horizontal" || value === "vertical";
}

function getDefaultRegistrationReminderPreferences(): RegistrationReminderPreferences
{
  return {
    ...DEFAULT_REGISTRATION_REMINDER_PREFERENCES,
  };
}

export function normalizeRegistrationReminderPreferences(value: unknown): RegistrationReminderPreferences
{
  if (!value || typeof value !== "object")
  {
    return getDefaultRegistrationReminderPreferences();
  }

  const candidate = value as Partial<RegistrationReminderPreferences>;

  return {
    enabled: typeof candidate.enabled === "boolean"
      ? candidate.enabled
      : getDefaultRegistrationReminderPreferences().enabled,
  };
}

function isTimetableStudyMode(value: unknown): value is TimetableStudyMode
{
  return value === "full-time" || value === "part-time";
}

export function getThemeOption(themeId: string)
{
  return APP_THEME_OPTIONS.find((theme) => theme.id === themeId) ?? APP_THEME_OPTIONS[0];
}

export function getSettingsThemePalette(settings: Pick<SettingsState, "themeId">)
{
  return getThemeOption(settings.themeId).colors;
}

export function normalizeAppSettings(value: unknown): SettingsState
{
  if (!value || typeof value !== "object")
  {
    return DEFAULT_APP_SETTINGS;
  }

  const candidate = value as Partial<SettingsState>;
  const themeExists = typeof candidate.themeId === "string"
    && APP_THEME_OPTIONS.some((theme) => theme.id === candidate.themeId);

  return {
    colorScheme: isColorSchemePreference(candidate.colorScheme)
      ? candidate.colorScheme
      : DEFAULT_APP_SETTINGS.colorScheme,
    themeId: themeExists ? candidate.themeId as string : DEFAULT_APP_SETTINGS.themeId,
    timetableOrientation: isTimetableOrientation(candidate.timetableOrientation)
      ? candidate.timetableOrientation
      : DEFAULT_APP_SETTINGS.timetableOrientation,
    registrationReminders: normalizeRegistrationReminderPreferences(candidate.registrationReminders),
    timetableStudyMode: isTimetableStudyMode(candidate.timetableStudyMode)
      ? candidate.timetableStudyMode
      : DEFAULT_APP_SETTINGS.timetableStudyMode,
  };
}

export function readAppSettings()
{
  if (!canUseLocalStorage())
  {
    return DEFAULT_APP_SETTINGS;
  }

  const stored = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
  if (!stored)
  {
    return DEFAULT_APP_SETTINGS;
  }

  try
  {
    return normalizeAppSettings(JSON.parse(stored));
  }
  catch
  {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: SettingsState)
{
  if (!canUseLocalStorage())
  {
    return;
  }

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeAppSettings(settings)));
}

export function announceAppSettingsUpdated()
{
  if (typeof window === "undefined")
  {
    return;
  }

  window.dispatchEvent(new CustomEvent(APP_SETTINGS_UPDATED_EVENT));
}
