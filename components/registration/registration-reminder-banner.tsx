import {
  BellIcon,
  CalendarWeekIcon,
  XIcon,
} from "@/components/planner/icons";
import { RegistrationReminderStatusPill } from "@/components/registration/reminder-status-pill";
import {
  getRegistrationReminderWindowState,
  REGISTRATION_REMINDER_STATUS_CLASS_NAMES,
} from "@/lib/registration/reminder-status";
import {
  formatRegistrationReminderDateTime,
  parseRegistrationReminderDate,
} from "@/lib/registration/reminder-time";
import type { RegistrationReminder } from "@/lib/registration/types";

type RegistrationReminderBannerProps = {
  reminders: RegistrationReminder[];
  onCloseReminder?: (reminder: RegistrationReminder) => void;
  variant?: "inline" | "notification" | "stacked";
  className?: string;
};

function RegistrationReminderItem({
  reminder,
  onCloseReminder,
  variant,
}: {
  reminder: RegistrationReminder;
  onCloseReminder?: (reminder: RegistrationReminder) => void;
  variant: "inline" | "notification" | "stacked";
})
{
  const isNotification = variant !== "inline";
  const detailListClassName = isNotification
    ? "mt-1.5 grid text-[12px] leading-[18px] text-[var(--on-surface-variant)]"
    : "mt-2 grid gap-[0.45rem] text-[12px] leading-5 text-[var(--on-surface-variant)] sm:grid-cols-2";
  const now = new Date();
  const eventStartsAt = parseRegistrationReminderDate(reminder.eventStartsAt);
  const eventEndsAt = parseRegistrationReminderDate(reminder.eventEndsAt);
  const windowState = reminder.phase ?? getRegistrationReminderWindowState(eventStartsAt, eventEndsAt, now);

  return (
    <article className={`app-aero-panel ${isNotification ? "app-notification-card" : ""} registration-reminder-card ${REGISTRATION_REMINDER_STATUS_CLASS_NAMES[windowState]} overflow-hidden text-[var(--on-surface)]`}>
      <div className="registration-reminder-heading flex min-h-10 items-center justify-between gap-2 py-1 pl-3 pr-1">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold leading-5">
          <BellIcon className="h-4 w-4 shrink-0 text-[var(--reminder-status-color)]" />
          Reminder
        </h3>
        {onCloseReminder ? (
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.25rem] transition-colors hover:bg-[var(--surface-container-lowest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--reminder-status-color)]"
            aria-label={`Snooze ${reminder.title}`}
            title="Snooze reminder"
            onClick={() => onCloseReminder(reminder)}
          >
            <XIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="registration-reminder-content p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="min-w-0 flex-1 break-words text-[14px] font-bold leading-5">
            {reminder.title}
          </h4>
          <RegistrationReminderStatusPill state={windowState} />
        </div>

        {reminder.body ? (
          <p className="mt-2 whitespace-pre-line break-words text-[13px] leading-5">
            {reminder.body}
          </p>
        ) : null}

        <dl className={detailListClassName}>
          <div className="flex min-w-0 items-start gap-1.5">
            <CalendarWeekIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--reminder-status-color)]" />
            <div className="min-w-0">
              <dt className="font-semibold leading-4 text-[var(--on-surface)]">Window</dt>
              <dd className="min-w-0 break-words">
                <div>
                  <span className="font-medium text-[var(--on-surface)]">Start:</span> {formatRegistrationReminderDateTime(reminder.eventStartsAt)}
                </div>
                <div>
                  <span className="font-medium text-[var(--on-surface)]">End:</span> {formatRegistrationReminderDateTime(reminder.eventEndsAt)}
                </div>
              </dd>
            </div>
          </div>
        </dl>
      </div>
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
    : variant === "stacked"
      ? "space-y-2.5"
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
