import { z } from "zod";

export const VALID_START_TIMES = ["08:30", "12:00", "15:30", "19:00"] as const;
export const VALID_DURATIONS = [2, 3] as const;
export const VALID_WEEK_PATTERNS = ["all", "odd", "even"] as const;
export const VALID_CLASS_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const DAY_ALIASES: Record<string, (typeof VALID_CLASS_DAYS)[number]> = {
  MON: "Mon",
  MONDAY: "Mon",
  TUE: "Tue",
  TUESDAY: "Tue",
  WED: "Wed",
  WEDNESDAY: "Wed",
  THU: "Thu",
  THURSDAY: "Thu",
  FRI: "Fri",
  FRIDAY: "Fri",
  SAT: "Sat",
  SATURDAY: "Sat",
  SUN: "Sun",
  SUNDAY: "Sun",
};

export function normalizeModuleCode(value: unknown)
{
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/-TG\d+$/i, "")
    .replace(/TG\d+$/i, "");
}

export function normalizeTg(value: unknown)
{
  const raw = String(value ?? "").trim().toUpperCase();
  const digits = raw.match(/(\d{1,3})/)?.[1];
  return digits ? `TG${digits.padStart(2, "0")}` : "TG01";
}

export function normalizeDay(value: unknown)
{
  const key = String(value ?? "").trim().toUpperCase();
  return DAY_ALIASES[key] ?? value;
}

export function normalizeClockValue(value: unknown)
{
  const raw = String(value ?? "").trim();
  if (/^\d{4}$/.test(raw))
  {
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }

  if (/^\d{2}:\d{2}$/.test(raw))
  {
    return raw;
  }

  return value;
}

export function computeEndTime(startTime: string, durationHours: number)
{
  const [hoursText, minutesText] = startTime.split(":");
  const totalMinutes = Number(hoursText) * 60 + Number(minutesText) + durationHours * 60;
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;

  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

export function durationFromStartAndEnd(startTime: string, endTime: string)
{
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const diffMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return diffMinutes / 60;
}

export function toFrontendTime(clockValue: string)
{
  return clockValue.replace(":", "");
}

export const uuidSchema = z.string().uuid();

export const moduleCodeSchema = z.preprocess(
  normalizeModuleCode,
  z.string().min(3).max(20).regex(/^[A-Z0-9]+$/)
);

export const tgSchema = z.preprocess(
  normalizeTg,
  z.string().regex(/^TG\d{2,3}$/)
);

export const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase());

export const daySchema = z.preprocess(
  normalizeDay,
  z.enum(VALID_CLASS_DAYS)
);

export const weekPatternSchema = z.preprocess(
  (value) => String(value ?? "all").trim().toLowerCase(),
  z.enum(VALID_WEEK_PATTERNS)
);

export const classStartTimeSchema = z.preprocess(
  normalizeClockValue,
  z.enum(VALID_START_TIMES)
);

export const durationHoursSchema = z.preprocess(
  (value) => Number(value),
  z.union([z.literal(2), z.literal(3)])
);
