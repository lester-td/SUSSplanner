export function toMinutes(time)
{
  const hours = Number(time.slice(0, 2));
  const mins = Number(time.slice(2));
  return hours * 60 + mins;
}

export function fromMinutes(totalMinutes)
{
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}${String(mins).padStart(2, "0")}`;
}

export function getWeekStart(reference, weekOffset)
{
  const ref = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = ref.getDay();
  const distanceToMonday = day === 0 ? 6 : day - 1;
  ref.setDate(ref.getDate() - distanceToMonday + weekOffset * 7);
  return ref;
}

export function dayLabel(date)
{
  return date.toLocaleDateString("en-SG", { day: "2-digit", month: "short" });
}

export function getIsoWeekNumber(date)
{
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}
