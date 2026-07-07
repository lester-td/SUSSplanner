import {
  BellIcon,
  CalendarWeekIcon,
  XIcon,
} from "@/components/planner/icons";
import { RegistrationReminderStatusPill } from "@/components/registration/reminder-status-pill";
import { getRegistrationReminderWindowState } from "@/lib/registration/reminder-status";
import {
  formatRegistrationReminderDateTime,
  parseRegistrationReminderDate,
} from "@/lib/registration/reminder-time";
import type { RegistrationReminder } from "@/lib/registration/types";

type RegistrationReminderBannerProps = {
  reminders: RegistrationReminder[];
  onCloseReminder?: (reminder: RegistrationReminder) => void;
  variant?: "inline" | "notification";
  className?: string;
};

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
    ? "relative h-[6.75rem] overflow-hidden rounded-[0.35rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] py-2 pl-3 pr-[3.25rem] text-[var(--on-surface)] shadow-[var(--shadow-elev-3)]"
    : "relative overflow-hidden rounded-[0.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] py-3 pl-3 pr-[3.25rem] text-[var(--on-surface)] shadow-[var(--shadow-elev-1)]";
  const detailListClassName = isNotification
    ? "mt-1.5 grid text-[12px] leading-[18px] text-[var(--on-surface-variant)]"
    : "mt-2 grid gap-[0.45rem] text-[12px] leading-5 text-[var(--on-surface-variant)] sm:grid-cols-2";
  const now = new Date();
  const eventStartsAt = parseRegistrationReminderDate(reminder.eventStartsAt);
  const eventEndsAt = parseRegistrationReminderDate(reminder.eventEndsAt);
  const windowState = reminder.phase ?? getRegistrationReminderWindowState(eventStartsAt, eventEndsAt, now);

  return (
    <article className={itemClassName}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-[var(--primary)]" />

      <div className={`flex flex-col gap-2 ${isNotification ? "" : "sm:flex-row sm:items-start sm:justify-between"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[0.35rem] bg-[var(--brand-chip-bg)] text-[var(--primary)]">
              <BellIcon className="h-4 w-4" />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold leading-5 text-[var(--on-surface)]">
              {reminder.title}
            </h3>
            <RegistrationReminderStatusPill state={windowState} />
          </div>

          {reminder.body ? (
            <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface)]">
              {reminder.body}
            </p>
          ) : null}

          <dl className={detailListClassName}>
            <div className="flex min-w-0 items-start gap-1.5">
              <CalendarWeekIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
              <div className="min-w-0">
                <dt className="font-semibold leading-4 text-[var(--on-surface)]">Window</dt>
                <dd className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium text-[var(--on-surface)]">Start:</span> {formatRegistrationReminderDateTime(reminder.eventStartsAt)}
                  </div>
                  <div className="truncate">
                    <span className="font-medium text-[var(--on-surface)]">End:</span> {formatRegistrationReminderDateTime(reminder.eventEndsAt)}
                  </div>
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      {onCloseReminder ? (
        <button
          type="button"
          className="absolute inset-y-0 right-0 inline-flex h-full w-11 items-center justify-center border-l border-[var(--brand-divider)] text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--brand-chip-bg)] hover:text-[var(--primary)]"
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
    ? "pointer-events-auto fixed right-3 top-[6.75rem] z-50 w-[min(calc(100vw-1.5rem),18rem)] space-y-2.5 sm:right-4 sm:top-[7.25rem] xl:top-[4.75rem]"
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
