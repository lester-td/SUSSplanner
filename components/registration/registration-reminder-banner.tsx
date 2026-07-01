import {
  CalendarIcon,
  ClockIcon,
  XIcon,
} from "@/components/planner/icons";
import type { ReactNode } from "react";
import type { RegistrationReminder } from "@/lib/registration/types";

type RegistrationReminderBannerProps = {
  reminders: RegistrationReminder[];
  onDismissReminder?: (reminder: RegistrationReminder) => void;
  onSnoozeReminder?: (reminder: RegistrationReminder) => void;
  className?: string;
};

function formatReminderTimestamp(timestamp: string)
{
  return timestamp
    .replace("T", " ")
    .replace(/:00\+08:00$/, "")
    .replace(/\+08:00$/, " SGT");
}

function ReminderActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
})
{
  return (
    <button
      type="button"
      className="inline-flex h-8 shrink-0 items-center justify-center rounded-[0.45rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-2.5 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RegistrationReminderItem({
  reminder,
  onDismissReminder,
  onSnoozeReminder,
}: {
  reminder: RegistrationReminder;
  onDismissReminder?: (reminder: RegistrationReminder) => void;
  onSnoozeReminder?: (reminder: RegistrationReminder) => void;
})
{
  return (
    <article className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.45rem] bg-[var(--primary-fixed)] text-[var(--primary)]">
              <CalendarIcon className="h-4 w-4" />
            </span>
            <h3 className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
              {reminder.title}
            </h3>
            <span className="rounded-full border border-[var(--outline-variant)] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[var(--on-surface-variant)]">
              {reminder.offset.label}
            </span>
          </div>

          {reminder.body ? (
            <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface)]">
              {reminder.body}
            </p>
          ) : null}

          <dl className="mt-2 grid gap-1.5 text-[12px] leading-5 text-[var(--on-surface-variant)] sm:grid-cols-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <ClockIcon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
              <dt className="sr-only">Reminder time</dt>
              <dd className="truncate">Reminder: {formatReminderTimestamp(reminder.remindAt)}</dd>
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
              <dt className="sr-only">Registration window</dt>
              <dd className="truncate">
                Window: {formatReminderTimestamp(reminder.eventStartsAt)} to {formatReminderTimestamp(reminder.eventEndsAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {onSnoozeReminder ? (
            <ReminderActionButton onClick={() => onSnoozeReminder(reminder)}>
              Snooze
            </ReminderActionButton>
          ) : null}
          {onDismissReminder ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.45rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              aria-label={`Dismiss ${reminder.title}`}
              title="Dismiss reminder"
              onClick={() => onDismissReminder(reminder)}
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function RegistrationReminderBanner({
  reminders,
  onDismissReminder,
  onSnoozeReminder,
  className = "",
}: RegistrationReminderBannerProps)
{
  if (reminders.length === 0)
  {
    return null;
  }

  return (
    <section
      className={`space-y-2 rounded-[0.75rem] border border-[var(--primary)]/20 bg-[var(--primary-fixed)] p-2.5 ${className}`}
      aria-label="Course registration reminders"
    >
      {reminders.map((reminder) => (
        <RegistrationReminderItem
          key={`${reminder.id}:${reminder.channel}`}
          reminder={reminder}
          onDismissReminder={onDismissReminder}
          onSnoozeReminder={onSnoozeReminder}
        />
      ))}
    </section>
  );
}
