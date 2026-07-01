import type {
  LocalRegistrationReminderState,
  RegistrationEvent,
  RegistrationReminder,
  ReminderChannel,
  ReminderOffset,
} from "@/lib/registration/types";
import { validateRegistrationSchedule, validateReminderOffsets } from "@/lib/registration/validation";

const MINUTE_IN_MS = 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * MINUTE_IN_MS;
const DEFAULT_REMINDER_CHANNELS: ReminderChannel[] = ["in-app", "push"];

export const DEFAULT_REGISTRATION_REMINDER_OFFSETS: ReminderOffset[] = [
  {
    offsetMinutes: 7 * 24 * 60,
    label: "7 days before",
  },
  {
    offsetMinutes: 24 * 60,
    label: "1 day before",
  },
  {
    offsetMinutes: 0,
    label: "At opening time",
  },
];

export type ReminderVersionRecord = {
  eventVersion: string;
};

export type RegistrationReminderOptions = {
  enabled?: boolean;
  now?: Date | string | number;
  offsets?: readonly ReminderOffset[];
  channels?: readonly ReminderChannel[];
  channel?: ReminderChannel;
  dismissedReminders?: LocalRegistrationReminderState["dismissedReminders"];
};

export type DueRegistrationReminderOptions = RegistrationReminderOptions & {
  sentReminders?: Record<string, ReminderVersionRecord>;
};

export type ActiveRegistrationReminderOptions = RegistrationReminderOptions & {
  selectMostUrgentPerEvent?: boolean;
};

export function parseRegistrationReminderTimestamp(value: string | Date | number)
{
  const timestamp = typeof value === "number"
    ? value
    : value instanceof Date ? value.getTime() : Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function resolveNowTimestamp(now: Date | string | number | undefined)
{
  if (typeof now === "undefined")
  {
    return Date.now();
  }

  return parseRegistrationReminderTimestamp(now);
}

function padNumber(value: number, length = 2)
{
  return String(value).padStart(length, "0");
}

function formatSingaporeTimestamp(timestamp: number)
{
  const date = new Date(timestamp + SINGAPORE_OFFSET_MS);

  return [
    padNumber(date.getUTCFullYear(), 4),
    "-",
    padNumber(date.getUTCMonth() + 1),
    "-",
    padNumber(date.getUTCDate()),
    "T",
    padNumber(date.getUTCHours()),
    ":",
    padNumber(date.getUTCMinutes()),
    ":",
    padNumber(date.getUTCSeconds()),
    "+08:00",
  ].join("");
}

function normalizeChannels(options: Pick<RegistrationReminderOptions, "channel" | "channels">)
{
  if (options.channel)
  {
    return [options.channel];
  }

  return options.channels && options.channels.length > 0
    ? [...options.channels]
    : DEFAULT_REMINDER_CHANNELS;
}

function isDismissed(
  reminder: RegistrationReminder,
  dismissedReminders: LocalRegistrationReminderState["dismissedReminders"] | undefined,
)
{
  const dismissed = dismissedReminders?.[reminder.id];

  return dismissed?.eventVersion === reminder.eventVersion;
}

function isSent(
  reminder: RegistrationReminder,
  sentReminders: Record<string, ReminderVersionRecord> | undefined,
)
{
  const sent = sentReminders?.[reminder.id];

  return sent?.eventVersion === reminder.eventVersion;
}

function compareReminderUrgency(left: RegistrationReminder, right: RegistrationReminder)
{
  const leftDueAt = parseRegistrationReminderTimestamp(left.dueAt) ?? 0;
  const rightDueAt = parseRegistrationReminderTimestamp(right.dueAt) ?? 0;

  if (leftDueAt !== rightDueAt)
  {
    return rightDueAt - leftDueAt;
  }

  const leftOffset = Math.abs(left.offset.offsetMinutes);
  const rightOffset = Math.abs(right.offset.offsetMinutes);

  if (leftOffset !== rightOffset)
  {
    return leftOffset - rightOffset;
  }

  return left.id.localeCompare(right.id);
}

export function selectMostUrgentRegistrationReminders(reminders: readonly RegistrationReminder[])
{
  const byEventId = new Map<string, RegistrationReminder>();

  reminders.forEach((reminder) => {
    const current = byEventId.get(reminder.eventId);

    if (!current || compareReminderUrgency(reminder, current) < 0)
    {
      byEventId.set(reminder.eventId, reminder);
    }
  });

  return [...byEventId.values()];
}

export function buildReminderId(eventId: string, offsetMinutes: number)
{
  return `${eventId}:${offsetMinutes}`;
}

export function resolveRegistrationReminderOffsets(offsetMinutes: readonly number[] | undefined)
{
  if (!offsetMinutes || offsetMinutes.length === 0)
  {
    return DEFAULT_REGISTRATION_REMINDER_OFFSETS;
  }

  const selectedOffsetMinutes = new Set(offsetMinutes);
  const selectedOffsets = DEFAULT_REGISTRATION_REMINDER_OFFSETS.filter((offset) => (
    selectedOffsetMinutes.has(offset.offsetMinutes)
  ));

  return selectedOffsets.length > 0
    ? selectedOffsets
    : DEFAULT_REGISTRATION_REMINDER_OFFSETS;
}

export function deriveRegistrationEventVersion(event: RegistrationEvent)
{
  const scheduleVersion = event.scheduleVersion?.trim();

  if (scheduleVersion)
  {
    return scheduleVersion;
  }

  return [
    event.startsAt,
    event.endsAt,
    event.sourceUpdatedAt?.trim() ?? "",
  ].join("|");
}

export function buildRegistrationReminderCandidates(
  events: readonly RegistrationEvent[],
  options: Pick<RegistrationReminderOptions, "enabled" | "offsets" | "channel" | "channels"> = {},
)
{
  if (options.enabled === false)
  {
    return [];
  }

  const validEvents = validateRegistrationSchedule(events);
  const validOffsets = validateReminderOffsets(options.offsets ?? DEFAULT_REGISTRATION_REMINDER_OFFSETS);
  const channels = normalizeChannels(options);
  const reminders: RegistrationReminder[] = [];

  validEvents.forEach((event) => {
    const eventVersion = deriveRegistrationEventVersion(event);
    const eventStartsAtTimestamp = parseRegistrationReminderTimestamp(event.startsAt);

    if (eventStartsAtTimestamp === null)
    {
      return;
    }

    validOffsets.forEach((offset) => {
      const dueAt = formatSingaporeTimestamp(eventStartsAtTimestamp - offset.offsetMinutes * MINUTE_IN_MS);
      const id = buildReminderId(event.id, offset.offsetMinutes);

      channels.forEach((channel) => {
        reminders.push({
          id,
          eventId: event.id,
          eventVersion,
          channel,
          offset,
          dueAt,
          visibleFrom: dueAt,
          visibleUntil: event.endsAt,
          remindAt: dueAt,
          eventStartsAt: event.startsAt,
          eventEndsAt: event.endsAt,
          title: event.title,
        });
      });
    });
  });

  return reminders;
}

export function filterRegistrationReminders(
  reminders: readonly RegistrationReminder[],
  options: RegistrationReminderOptions = {},
)
{
  if (options.enabled === false)
  {
    return [];
  }

  const nowTimestamp = resolveNowTimestamp(options.now);
  const configuredOffsetMinutes = options.offsets
    ? new Set(validateReminderOffsets(options.offsets).map((offset) => offset.offsetMinutes))
    : null;

  if (nowTimestamp === null)
  {
    return [];
  }

  return reminders.filter((reminder) => {
    if (options.channel && reminder.channel !== options.channel)
    {
      return false;
    }

    if (options.channels && options.channels.length > 0 && !options.channels.includes(reminder.channel))
    {
      return false;
    }

    if (configuredOffsetMinutes && !configuredOffsetMinutes.has(reminder.offset.offsetMinutes))
    {
      return false;
    }

    if (isDismissed(reminder, options.dismissedReminders))
    {
      return false;
    }

    return true;
  });
}

export function isRegistrationReminderActive(reminder: RegistrationReminder, now: Date | string | number)
{
  const nowTimestamp = parseRegistrationReminderTimestamp(now);
  const visibleFromTimestamp = parseRegistrationReminderTimestamp(reminder.visibleFrom);
  const visibleUntilTimestamp = parseRegistrationReminderTimestamp(reminder.visibleUntil);

  return nowTimestamp !== null
    && visibleFromTimestamp !== null
    && visibleUntilTimestamp !== null
    && nowTimestamp >= visibleFromTimestamp
    && nowTimestamp <= visibleUntilTimestamp;
}

export function getActiveRegistrationReminders(
  events: readonly RegistrationEvent[],
  options: ActiveRegistrationReminderOptions = {},
)
{
  const nowTimestamp = resolveNowTimestamp(options.now);

  if (nowTimestamp === null)
  {
    return [];
  }

  const candidates = buildRegistrationReminderCandidates(events, options);
  const active = filterRegistrationReminders(candidates, options)
    .filter((reminder) => isRegistrationReminderActive(reminder, nowTimestamp));

  return options.selectMostUrgentPerEvent === false
    ? active
    : selectMostUrgentRegistrationReminders(active);
}

export function getActiveInAppRegistrationReminders(
  events: readonly RegistrationEvent[],
  options: Omit<ActiveRegistrationReminderOptions, "channel" | "channels"> = {},
)
{
  return getActiveRegistrationReminders(events, {
    ...options,
    channel: "in-app",
    selectMostUrgentPerEvent: options.selectMostUrgentPerEvent ?? true,
  });
}

export function isRegistrationReminderDue(reminder: RegistrationReminder, now: Date | string | number)
{
  const nowTimestamp = parseRegistrationReminderTimestamp(now);
  const dueAtTimestamp = parseRegistrationReminderTimestamp(reminder.dueAt);
  const visibleUntilTimestamp = parseRegistrationReminderTimestamp(reminder.visibleUntil);

  return nowTimestamp !== null
    && dueAtTimestamp !== null
    && visibleUntilTimestamp !== null
    && nowTimestamp >= dueAtTimestamp
    && nowTimestamp <= visibleUntilTimestamp;
}

export function getDueRegistrationReminders(
  events: readonly RegistrationEvent[],
  options: DueRegistrationReminderOptions = {},
)
{
  const nowTimestamp = resolveNowTimestamp(options.now);

  if (nowTimestamp === null)
  {
    return [];
  }

  const candidates = buildRegistrationReminderCandidates(events, {
    ...options,
    channel: options.channel ?? "push",
  });

  return filterRegistrationReminders(candidates, options)
    .filter((reminder) => isRegistrationReminderDue(reminder, nowTimestamp))
    .filter((reminder) => !isSent(reminder, options.sentReminders));
}
