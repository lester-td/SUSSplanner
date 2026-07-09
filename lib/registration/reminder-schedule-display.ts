import {
  CLOSING_REMINDER_THRESHOLD_HOURS,
  UPCOMING_REMINDER_THRESHOLD_HOURS,
} from "@/lib/registration/reminder-thresholds";
import { REGISTRATION_REMINDER_SCHEDULE_STATUS_LABELS } from "@/lib/registration/reminder-status";
import type { RegistrationReminderPhase } from "@/lib/registration/types";

type ReminderScheduleDisplayItem = {
  phase: RegistrationReminderPhase;
  label: string;
  description: string;
};

function formatThresholdHours(hours: number)
{
  return hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`;
}

function formatThresholdList(thresholds: readonly number[])
{
  return [...thresholds]
    .reverse()
    .map(formatThresholdHours)
    .join(" • ");
}

export const REGISTRATION_REMINDER_SCHEDULE_DISPLAY_ITEMS: ReminderScheduleDisplayItem[] = [
  {
    phase: "upcoming",
    label: REGISTRATION_REMINDER_SCHEDULE_STATUS_LABELS.upcoming,
    description: `${formatThresholdList(UPCOMING_REMINDER_THRESHOLD_HOURS)} before opening`,
  },
  {
    phase: "open",
    label: REGISTRATION_REMINDER_SCHEDULE_STATUS_LABELS.open,
    description: "At opening • Every 24h while open",
  },
  {
    phase: "closing",
    label: REGISTRATION_REMINDER_SCHEDULE_STATUS_LABELS.closing,
    description: `${formatThresholdList(CLOSING_REMINDER_THRESHOLD_HOURS)} before closing`,
  },
];
