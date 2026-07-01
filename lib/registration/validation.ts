import type { RegistrationEvent, ReminderOffset } from "@/lib/registration/types";

const SINGAPORE_ISO_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?\+08:00$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_WITH_ZONE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|[+-]\d{2}:\d{2})$/;

function isDevelopmentOrTest()
{
  return process.env.NODE_ENV !== "production";
}

function parseTimestamp(value: string)
{
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function hasValidDateTimeParts(match: RegExpMatchArray)
{
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = match[7] ? Number(match[7]) : 0;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second
    && date.getUTCMilliseconds() === millisecond;
}

function isValidDateOnly(value: string)
{
  if (!DATE_ONLY_PATTERN.test(value))
  {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isValidSingaporeIsoDateTime(value: string)
{
  const match = value.match(SINGAPORE_ISO_DATETIME_PATTERN);

  return Boolean(match && hasValidDateTimeParts(match) && parseTimestamp(value) !== null);
}

function isValidSourceUpdatedAt(value: string)
{
  if (isValidDateOnly(value))
  {
    return true;
  }

  const match = value.match(ISO_DATETIME_WITH_ZONE_PATTERN);

  return Boolean(match && hasValidDateTimeParts(match) && parseTimestamp(value) !== null);
}

function handleValidationErrors(errors: string[], context: string)
{
  if (errors.length === 0)
  {
    return;
  }

  const message = `${context} validation failed:\n- ${errors.join("\n- ")}`;

  if (isDevelopmentOrTest())
  {
    throw new Error(message);
  }

  console.error(message);
}

export function getRegistrationScheduleValidationErrors(events: readonly RegistrationEvent[])
{
  const errors: string[] = [];
  const seenIds = new Set<string>();

  events.forEach((event, index) => {
    const label = event.id ? `event "${event.id}"` : `event at index ${index}`;
    const id = event.id.trim();
    const title = event.title.trim();
    const sourceLabel = event.sourceLabel.trim();
    const startsAt = event.startsAt.trim();
    const endsAt = event.endsAt.trim();
    const startsAtTimestamp = parseTimestamp(startsAt);
    const endsAtTimestamp = parseTimestamp(endsAt);

    if (!id)
    {
      errors.push(`${label} has a missing ID.`);
    }
    else if (seenIds.has(id))
    {
      errors.push(`duplicate registration event ID "${id}".`);
    }
    else
    {
      seenIds.add(id);
    }

    if (!title)
    {
      errors.push(`${label} has a missing title.`);
    }

    if (!sourceLabel)
    {
      errors.push(`${label} has a missing sourceLabel.`);
    }

    if (!isValidSingaporeIsoDateTime(startsAt))
    {
      errors.push(`${label} has an invalid startsAt; expected a full ISO timestamp with +08:00.`);
    }

    if (!isValidSingaporeIsoDateTime(endsAt))
    {
      errors.push(`${label} has an invalid endsAt; expected a full ISO timestamp with +08:00.`);
    }

    if (startsAtTimestamp !== null && endsAtTimestamp !== null && endsAtTimestamp <= startsAtTimestamp)
    {
      errors.push(`${label} has endsAt that is not after startsAt.`);
    }

    if (typeof event.sourceUpdatedAt === "string"
      && event.sourceUpdatedAt.trim()
      && !isValidSourceUpdatedAt(event.sourceUpdatedAt.trim()))
    {
      errors.push(`${label} has an invalid sourceUpdatedAt; expected YYYY-MM-DD or a full ISO datetime.`);
    }
  });

  return errors;
}

export function assertValidRegistrationSchedule(events: readonly RegistrationEvent[])
{
  const errors = getRegistrationScheduleValidationErrors(events);

  handleValidationErrors(errors, "Registration schedule");
}

export function validateRegistrationSchedule(events: readonly RegistrationEvent[])
{
  const errors = getRegistrationScheduleValidationErrors(events);

  handleValidationErrors(errors, "Registration schedule");

  return errors.length === 0 ? [...events] : [];
}

export function getReminderOffsetValidationErrors(offsets: readonly ReminderOffset[])
{
  const errors: string[] = [];
  const seenOffsets = new Set<number>();

  offsets.forEach((offset, index) => {
    const label = offset.label.trim();

    if (!Number.isInteger(offset.offsetMinutes) || offset.offsetMinutes < 0)
    {
      errors.push(`reminder offset at index ${index} has an invalid offsetMinutes; expected a non-negative integer.`);
    }
    else if (seenOffsets.has(offset.offsetMinutes))
    {
      errors.push(`duplicate reminder offsetMinutes value ${offset.offsetMinutes}.`);
    }
    else
    {
      seenOffsets.add(offset.offsetMinutes);
    }

    if (!label)
    {
      errors.push(`reminder offset at index ${index} has a missing label.`);
    }
  });

  return errors;
}

export function assertValidReminderOffsets(offsets: readonly ReminderOffset[])
{
  const errors = getReminderOffsetValidationErrors(offsets);

  handleValidationErrors(errors, "Registration reminder offsets");
}

export function validateReminderOffsets(offsets: readonly ReminderOffset[])
{
  const errors = getReminderOffsetValidationErrors(offsets);

  handleValidationErrors(errors, "Registration reminder offsets");

  return errors.length === 0 ? [...offsets] : [];
}
