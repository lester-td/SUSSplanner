import {
  REGISTRATION_REMINDER_STATUS_CLASS_NAMES,
  REGISTRATION_REMINDER_WINDOW_STATUS_LABELS,
  type RegistrationReminderWindowState,
} from "@/lib/registration/reminder-status";
import type { ReactNode } from "react";

type RegistrationReminderStatusPillProps = {
  state: RegistrationReminderWindowState;
  children?: ReactNode;
};

export function RegistrationReminderStatusPill({
  state,
  children,
}: RegistrationReminderStatusPillProps)
{
  return (
    <span className={`inline-flex shrink-0 items-center rounded-[0.35rem] border px-1.5 py-0.5 text-[11px] font-bold leading-4 ${REGISTRATION_REMINDER_STATUS_CLASS_NAMES[state]}`}>
      {children ?? REGISTRATION_REMINDER_WINDOW_STATUS_LABELS[state]}
    </span>
  );
}
