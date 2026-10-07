"use client";

import { useEffect, useState } from "react";
import { ArrowUpRightIcon, BellIcon, XIcon } from "@/components/planner/icons";
import { GlobalRegistrationReminders } from "@/components/registration/global-registration-reminders";
import {
  ANNOUNCEMENT_DISMISSAL_STORAGE_KEY,
  dismissAnnouncement,
  getAnnouncementHref,
  getVisibleAnnouncements,
  readDismissedAnnouncementIds,
} from "@/lib/announcements";
import type { AnnouncementRecord } from "@/lib/data/snapshot-types";

export function GlobalNotifications({ announcements }: { announcements: AnnouncementRecord[] })
{
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);

  useEffect(() => {
    const sync = () => {
      setNow(Date.now());
      setDismissedIds(current => [...new Set([...current, ...readDismissedAnnouncementIds()])]);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANNOUNCEMENT_DISMISSAL_STORAGE_KEY || event.key === null)
      {
        setNow(Date.now());
        setDismissedIds(readDismissedAnnouncementIds());
      }
    };
    sync();
    setReady(true);
    const interval = window.setInterval(sync, 60_000);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const visible = ready ? getVisibleAnnouncements(announcements, now, dismissedIds) : [];
  return (
    <aside
      aria-label="Notifications"
      className="pointer-events-none fixed right-0 top-[6rem] z-50 max-h-[calc(100dvh-8rem)] w-[min(100vw,19.5rem)] space-y-2.5 overflow-y-auto p-3 sm:right-1 sm:top-[6.5rem] xl:top-[4rem]"
    >
      {visible.length > 0 ? (
        <section aria-label="Announcements" aria-live="polite" className="pointer-events-auto space-y-2.5">
          {visible.map(announcement => {
            const href = getAnnouncementHref(announcement.linkUrl);
            return (
              <article key={announcement.announcementId} className="app-aero-panel overflow-hidden text-[var(--on-surface)]">
                <div className="app-announcement-heading flex items-center justify-between gap-2 py-1 pl-3 pr-1">
                  <h3 className="flex items-center gap-2 text-[13px] font-semibold leading-5">
                    <BellIcon className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                    Announcement
                  </h3>
                  <button
                    type="button"
                    aria-label={`Dismiss announcement: ${announcement.message}`}
                    title="Dismiss announcement"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.25rem] transition-colors hover:bg-[var(--surface-container-lowest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                    onClick={() => setDismissedIds(dismissAnnouncement(announcement.announcementId, [...dismissedIds, ...readDismissedAnnouncementIds()]))}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="whitespace-pre-line break-words text-[13px] leading-5">{announcement.message}</p>
                  {href && announcement.linkLabel ? (
                    <a href={href} className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--primary)] underline underline-offset-2">
                      {announcement.linkLabel}
                      <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
      <div className="pointer-events-auto">
        <GlobalRegistrationReminders stacked />
      </div>
    </aside>
  );
}
