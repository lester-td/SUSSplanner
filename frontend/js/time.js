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

export const ACADEMIC_WEEK_MIN = 0;
export const ACADEMIC_WEEK_MAX = 12;

function normalizeDate(date)
{
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getAcademicWeekZeroStart(reference)
{
  return new Date(reference.getFullYear(), 7, 3);
}

function getAcademicFinalWeekEnd(reference)
{
  return new Date(reference.getFullYear(), 9, 31);
}

export function clampAcademicWeekOffset(weekOffset)
{
  const parsed = Number(weekOffset);
  if (!Number.isFinite(parsed))
  {
    return ACADEMIC_WEEK_MIN;
  }

  return Math.max(ACADEMIC_WEEK_MIN, Math.min(ACADEMIC_WEEK_MAX, Math.trunc(parsed)));
}

export function getAcademicWeekOffset(reference = new Date())
{
  const target = normalizeDate(reference);
  const start = getAcademicWeekZeroStart(target);
  const end = getAcademicFinalWeekEnd(target);

  if (target <= start)
  {
    return ACADEMIC_WEEK_MIN;
  }

  if (target >= end)
  {
    return ACADEMIC_WEEK_MAX;
  }

  const daysSinceWeekZero = Math.floor((target - start) / 86400000);
  return clampAcademicWeekOffset(Math.floor(daysSinceWeekZero / 7));
}

export function getAcademicWeekStart(reference = new Date(), weekOffset = ACADEMIC_WEEK_MIN)
{
  const start = getAcademicWeekZeroStart(reference);
  const safeWeek = clampAcademicWeekOffset(weekOffset);
  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + safeWeek * 7);
  return weekStart;
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
