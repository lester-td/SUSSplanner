import type {
  LocalRegistrationReminderState,
  RegistrationEvent,
  RegistrationReminder,
  ReminderChannel,
  ReminderOffset,
} from "@/lib/registration/types";
import { validateRegistrationSchedule, validateReminderOffsets } from "@/lib/registration/validation";

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const SINGAPORE_OFFSET_MS = 8 * 60 * MINUTE_IN_MS;
const DEFAULT_REMINDER_CHANNELS: ReminderChannel[] = ["in-app", "push"];
const UPCOMING_THRESHOLD_HOURS = [1, 6, 12, 24, 48, 72, 168] as const;
const CLOSING_THRESHOLD_HOURS = [1, 6, 12, 24] as const;

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
  dismissedIntervals?: LocalRegistrationReminderState["dismissedIntervals"];
  snoozedEvents?: LocalRegistrationReminderState["snoozedEvents"];
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

function getReminderDismissalStorageKey(reminder: RegistrationReminder)
{
  return reminder.storageKey ?? reminder.id;
}

function isDismissedInterval(
  reminder: RegistrationReminder,
  dismissedIntervals: LocalRegistrationReminderState["dismissedIntervals"] | undefined,
)
{
  const dismissed = dismissedIntervals?.[getReminderDismissalStorageKey(reminder)];

  return dismissed?.eventVersion === reminder.eventVersion;
}

function isSnoozed(
  reminder: RegistrationReminder,
  snoozedEvents: LocalRegistrationReminderState["snoozedEvents"] | undefined,
)
{
  const snoozed = snoozedEvents?.[reminder.eventId];

  return snoozed?.eventVersion === reminder.eventVersion;
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

export function buildRegistrationReminderStorageKey(eventId: string, intervalKey: string)
{
  return `registrationReminder:${eventId}:${intervalKey}`;
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

function resolveThresholdKey(hoursUntil: number, thresholds: readonly number[])
{
  const threshold = thresholds.find((candidate) => hoursUntil <= candidate);

  return typeof threshold === "number" ? `${threshold}h` : null;
}

function buildCurrentRegistrationReminder(
  event: RegistrationEvent,
  nowTimestamp: number,
  channel: ReminderChannel,
): RegistrationReminder | null
{
  const eventStartsAtTimestamp = parseRegistrationReminderTimestamp(event.startsAt);
  const eventEndsAtTimestamp = parseRegistrationReminderTimestamp(event.endsAt);

  if (
    eventStartsAtTimestamp === null
    || eventEndsAtTimestamp === null
    || nowTimestamp > eventEndsAtTimestamp
  )
  {
    return null;
  }

  const eventVersion = deriveRegistrationEventVersion(event);
  let phase: RegistrationReminder["phase"];
  let thresholdKey: string;
  let dueAtTimestamp: number;
  let offset: ReminderOffset;

  if (nowTimestamp < eventStartsAtTimestamp)
  {
    const hoursUntilStart = (eventStartsAtTimestamp - nowTimestamp) / HOUR_IN_MS;
    const upcomingThresholdKey = resolveThresholdKey(hoursUntilStart, UPCOMING_THRESHOLD_HOURS);

    if (!upcomingThresholdKey)
    {
      return null;
    }

    const thresholdHours = Number.parseInt(upcomingThresholdKey, 10);

    phase = "upcoming";
    thresholdKey = upcomingThresholdKey;
    dueAtTimestamp = eventStartsAtTimestamp - thresholdHours * HOUR_IN_MS;
    offset = {
      offsetMinutes: thresholdHours * 60,
      label: `${thresholdHours}h before start`,
    };
  }
  else if (nowTimestamp < eventEndsAtTimestamp - DAY_IN_MS)
  {
    const dayIndex = Math.floor((nowTimestamp - eventStartsAtTimestamp) / DAY_IN_MS);

    phase = "open";
    thresholdKey = `day-${dayIndex}`;
    dueAtTimestamp = eventStartsAtTimestamp + dayIndex * DAY_IN_MS;
    offset = {
      offsetMinutes: 0,
      label: "Open",
    };
  }
  else
  {
    const hoursUntilEnd = (eventEndsAtTimestamp - nowTimestamp) / HOUR_IN_MS;
    const closingThresholdKey = resolveThresholdKey(hoursUntilEnd, CLOSING_THRESHOLD_HOURS);

    if (!closingThresholdKey)
    {
      return null;
    }

    const thresholdHours = Number.parseInt(closingThresholdKey, 10);

    phase = "closing";
    thresholdKey = closingThresholdKey;
    dueAtTimestamp = eventEndsAtTimestamp - thresholdHours * HOUR_IN_MS;
    offset = {
      offsetMinutes: thresholdHours * 60,
      label: `${thresholdHours}h before end`,
    };
  }

  const intervalKey = `${phase}:${thresholdKey}`;
  const storageKey = buildRegistrationReminderStorageKey(event.id, intervalKey);

  return {
    id: storageKey,
    eventId: event.id,
    eventVersion,
    channel,
    offset,
    dueAt: formatSingaporeTimestamp(dueAtTimestamp),
    visibleFrom: formatSingaporeTimestamp(dueAtTimestamp),
    visibleUntil: event.endsAt,
    remindAt: formatSingaporeTimestamp(dueAtTimestamp),
    eventStartsAt: event.startsAt,
    eventEndsAt: event.endsAt,
    title: event.title,
    phase,
    intervalKey,
    storageKey,
  };
}

function compareActiveInAppRegistrationReminderPriority(left: RegistrationReminder, right: RegistrationReminder)
{
  const phasePriority: Record<NonNullable<RegistrationReminder["phase"]>, number> = {
    closing: 0,
    open: 1,
    upcoming: 2,
  };
  const leftPhasePriority = left.phase ? phasePriority[left.phase] : 3;
  const rightPhasePriority = right.phase ? phasePriority[right.phase] : 3;

  if (leftPhasePriority !== rightPhasePriority)
  {
    return leftPhasePriority - rightPhasePriority;
  }

  const leftStartsAt = parseRegistrationReminderTimestamp(left.eventStartsAt) ?? Number.MAX_SAFE_INTEGER;
  const rightStartsAt = parseRegistrationReminderTimestamp(right.eventStartsAt) ?? Number.MAX_SAFE_INTEGER;
  const leftEndsAt = parseRegistrationReminderTimestamp(left.eventEndsAt) ?? Number.MAX_SAFE_INTEGER;
  const rightEndsAt = parseRegistrationReminderTimestamp(right.eventEndsAt) ?? Number.MAX_SAFE_INTEGER;

  if (left.phase === "closing" && leftEndsAt !== rightEndsAt)
  {
    return leftEndsAt - rightEndsAt;
  }

  if (leftStartsAt !== rightStartsAt)
  {
    return leftStartsAt - rightStartsAt;
  }

  return left.id.localeCompare(right.id);
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

    if (isDismissedInterval(reminder, options.dismissedIntervals))
    {
      return false;
    }

    if (isSnoozed(reminder, options.snoozedEvents))
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
  const nowTimestamp = resolveNowTimestamp(options.now);

  if (options.enabled === false || nowTimestamp === null)
  {
    return [];
  }

  return validateRegistrationSchedule(events)
    .map((event) => buildCurrentRegistrationReminder(event, nowTimestamp, "in-app"))
    .filter((reminder): reminder is RegistrationReminder => Boolean(reminder))
    .filter((reminder) => !isDismissed(reminder, options.dismissedReminders))
    .filter((reminder) => !isDismissedInterval(reminder, options.dismissedIntervals))
    .sort(compareActiveInAppRegistrationReminderPriority)
    .slice(0, 1);
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
