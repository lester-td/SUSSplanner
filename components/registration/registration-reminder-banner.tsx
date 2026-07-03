import {
  CalendarIcon,
  ClockIcon,
  XIcon,
} from "@/components/planner/icons";
import type { RegistrationReminder } from "@/lib/registration/types";

type RegistrationReminderBannerProps = {
  reminders: RegistrationReminder[];
  onCloseReminder?: (reminder: RegistrationReminder) => void;
  variant?: "inline" | "notification";
  className?: string;
};

function formatReminderTimestamp(timestamp: string)
{
  return timestamp
    .replace("T", " ")
    .replace(/:00\+08:00$/, "")
    .replace(/\+08:00$/, " SGT");
}

function RegistrationReminderItem({
  reminder,
  onCloseReminder,
  variant,
}: {
  reminder: RegistrationReminder;
  onCloseReminder?: (reminder: RegistrationReminder) => void;
  variant: "inline" | "notification";
})
{
  const isNotification = variant === "notification";
  const itemClassName = isNotification
    ? "relative overflow-hidden rounded-[0.35rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] py-2.5 pl-3 pr-12 text-[var(--on-surface)] shadow-[var(--shadow-elev-3)]"
    : "relative overflow-hidden rounded-[0.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] py-3 pl-3 pr-12 text-[var(--on-surface)] shadow-[var(--shadow-elev-1)]";

  return (
    <article className={itemClassName}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--primary)]" />

      <div className={`flex flex-col gap-2 ${isNotification ? "" : "sm:flex-row sm:items-start sm:justify-between"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.35rem] bg-[var(--brand-chip-bg)] text-[var(--primary)]">
              <CalendarIcon className="h-4 w-4" />
            </span>
            <h3 className="text-[14px] font-bold leading-5 text-[var(--on-surface)]">
              {reminder.title}
            </h3>
          </div>

          {reminder.body ? (
            <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface)]">
              {reminder.body}
            </p>
          ) : null}

          <dl className={`mt-2 grid gap-1.5 text-[12px] leading-5 text-[var(--on-surface-variant)] ${isNotification ? "" : "sm:grid-cols-2"}`}>
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
      </div>

      {onCloseReminder ? (
        <button
          type="button"
          className="absolute bottom-0 right-0 top-0 inline-flex w-10 items-center justify-center border-l border-[var(--brand-divider)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--brand-chip-bg)] hover:text-[var(--primary)] sm:w-12"
          aria-label={`Snooze ${reminder.title}`}
          title="Snooze reminder"
          onClick={() => onCloseReminder(reminder)}
        >
          <XIcon className="h-4 w-4" />
        </button>
      ) : null}
    </article>
  );
}

export function RegistrationReminderBanner({
  reminders,
  onCloseReminder,
  variant = "inline",
  className = "",
}: RegistrationReminderBannerProps)
{
  if (reminders.length === 0)
  {
    return null;
  }

  const variantClassName = variant === "notification"
    ? "pointer-events-auto fixed right-3 top-3 z-50 w-[min(calc(100vw-1.5rem),24rem)] space-y-3 sm:right-4 sm:top-4"
    : "space-y-2 rounded-[0.75rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] p-2.5";

  return (
    <section
      className={`${variantClassName} ${className}`}
      aria-label="Course registration reminders"
    >
      {reminders.map((reminder) => (
        <RegistrationReminderItem
          key={`${reminder.id}:${reminder.channel}`}
          reminder={reminder}
          onCloseReminder={onCloseReminder}
          variant={variant}
        />
      ))}
    </section>
  );
}
