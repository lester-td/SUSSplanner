const MINUTE_IN_MS = 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * MINUTE_IN_MS;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function padNumber(value: number, length = 2)
{
  return String(value).padStart(length, "0");
}

export function parseRegistrationReminderTimestamp(value: string | Date | number)
{
  const timestamp = typeof value === "number"
    ? value
    : value instanceof Date ? value.getTime() : Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

export function parseRegistrationReminderDate(timestamp: string)
{
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatSingaporeTimestamp(timestamp: number)
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

export function formatRegistrationReminderDateTime(timestamp: string)
{
  const date = parseRegistrationReminderDate(timestamp);

  if (!date)
  {
    return timestamp;
  }

  const hours = date.getHours();
  const hour12 = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours < 12 ? "AM" : "PM";

  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}, ${hour12}:${minutes} ${period}`;
}
