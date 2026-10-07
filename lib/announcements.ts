import type { AnnouncementRecord } from "./data/snapshot-types";

export const ANNOUNCEMENT_DISMISSAL_STORAGE_KEY = "sussplanner.announcements.dismissed.v1";
type AnnouncementStorage = Pick<Storage, "getItem" | "setItem">;

export function getVisibleAnnouncements(
  announcements: AnnouncementRecord[],
  now = Date.now(),
  dismissedIds: number[] = [],
)
{
  const dismissed = new Set(dismissedIds);
  return announcements.filter(announcement => (
    announcement.enabled
    && !dismissed.has(announcement.announcementId)
    && Date.parse(announcement.publishAt) <= now
    && (announcement.expiresAt === null || Date.parse(announcement.expiresAt) > now)
  )).sort((left, right) => left.sortOrder - right.sortOrder || left.announcementId - right.announcementId);
}

function browserStorage()
{
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readDismissedAnnouncementIds(storage?: AnnouncementStorage): number[]
{
  try
  {
    const value: unknown = JSON.parse((storage ?? browserStorage())?.getItem(ANNOUNCEMENT_DISMISSAL_STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))]
      : [];
  }
  catch
  {
    return [];
  }
}

export function dismissAnnouncement(id: number, dismissedIds: number[], storage?: AnnouncementStorage)
{
  const next = [...new Set([...dismissedIds, id])];
  try
  {
    (storage ?? browserStorage())?.setItem(ANNOUNCEMENT_DISMISSAL_STORAGE_KEY, JSON.stringify(next));
  }
  catch
  {
    // The notification still closes for this session if browser storage is unavailable.
  }
  return next;
}

export function getAnnouncementHref(value: string | null): string | null
{
  const href = value?.trim();
  if (!href || /[\\\u0000-\u001f\u007f]/.test(href)) return null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try
  {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  }
  catch
  {
    return null;
  }
}
