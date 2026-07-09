import type { RegistrationReminderPhase } from "@/lib/registration/types";

export type RegistrationReminderWindowState = RegistrationReminderPhase | "ended";

export const REGISTRATION_REMINDER_WINDOW_STATUS_LABELS: Record<RegistrationReminderWindowState, string> = {
  upcoming: "Soon",
  open: "Open",
  closing: "Closing",
  ended: "Ended",
};

export const REGISTRATION_REMINDER_SCHEDULE_STATUS_LABELS: Record<RegistrationReminderPhase, string> = {
  upcoming: "Upcoming",
  open: "Open",
  closing: "Closing Soon",
};

export const REGISTRATION_REMINDER_STATUS_CLASS_NAMES: Record<RegistrationReminderWindowState, string> = {
  open: "registration-reminder-status--open",
  upcoming: "registration-reminder-status--upcoming",
  closing: "registration-reminder-status--closing-soon",
  ended: "registration-reminder-status--ended",
};

export function getRegistrationReminderWindowState(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date,
): RegistrationReminderWindowState
{
  if (!startsAt || !endsAt || now > endsAt)
  {
    return "ended";
  }

  if (now < startsAt)
  {
    return "upcoming";
  }

  const hoursUntilEnd = (endsAt.getTime() - now.getTime()) / (60 * 60 * 1000);

  return hoursUntilEnd <= 24 ? "closing" : "open";
}
