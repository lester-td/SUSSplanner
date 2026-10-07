import { describe, expect, it } from "vitest";
import {
  ANNOUNCEMENT_DISMISSAL_STORAGE_KEY,
  dismissAnnouncement,
  getAnnouncementHref,
  getVisibleAnnouncements,
  readDismissedAnnouncementIds,
} from "./announcements";
import type { AnnouncementRecord } from "./data/snapshot-types";

const announcement: AnnouncementRecord = {
  announcementId: 1, message: "January & May 2027 courses are now available.",
  linkUrl: "/courses", linkLabel: "View courses", publishAt: "2026-10-06T09:00:00+08:00",
  expiresAt: null, enabled: true, sortOrder: 1,
};

function memoryStorage(initial = "[]")
{
  const values = new Map([[ANNOUNCEMENT_DISMISSAL_STORAGE_KEY, initial]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("announcement dismissals", () => {
  it("persists dismissal by ID across visits while allowing a new announcement to appear", () => {
    const storage = memoryStorage();
    dismissAnnouncement(1, [], storage);
    const dismissed = readDismissedAnnouncementIds(storage);
    const now = Date.parse("2026-10-06T10:00:00+08:00");
    expect(getVisibleAnnouncements([
      { ...announcement, message: "Edited announcement" },
      { ...announcement, announcementId: 2 },
    ], now, dismissed).map(item => item.announcementId)).toEqual([2]);
  });

  it("ignores corrupt storage and invalid IDs", () => {
    expect(readDismissedAnnouncementIds(memoryStorage("invalid json"))).toEqual([]);
    expect(readDismissedAnnouncementIds(memoryStorage('{"id":1}'))).toEqual([]);
    expect(readDismissedAnnouncementIds(memoryStorage('[1,1,"2",null,-1,0,3.5,2]'))).toEqual([1, 2]);
  });

  it("still dismisses for the current session when browser storage is blocked", () => {
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readDismissedAnnouncementIds(storage)).toEqual([]);
    expect(dismissAnnouncement(1, [], storage)).toEqual([1]);
  });
});

describe("announcement links", () => {
  it.each(["/courses", "/courses?semesterIds=14", "https://www.suss.edu.sg/", "http://example.com/"])("allows navigation to %s", href => {
    expect(getAnnouncementHref(href)).toBe(href);
  });
  it.each([null, "", "javascript:alert(1)", "data:text/html,test", "//example.com", "/\\example.com", "/\n/example.com"])("omits invalid link %s", href => {
    expect(getAnnouncementHref(href)).toBeNull();
  });
});
