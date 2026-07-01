import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_REGISTRATION_REMINDER_PREFERENCES,
  normalizeAppSettings,
} from "@/lib/settings/app-settings";
import type { RegistrationEvent, RegistrationReminder, ReminderOffset } from "@/lib/registration/types";
import {
  buildRegistrationReminderCandidates,
  buildReminderId,
  deriveRegistrationEventVersion,
  getActiveInAppRegistrationReminders,
  getDueRegistrationReminders,
  resolveRegistrationReminderOffsets,
  selectMostUrgentRegistrationReminders,
} from "@/lib/registration/reminders";
import {
  assertValidRegistrationSchedule,
  assertValidReminderOffsets,
} from "@/lib/registration/validation";

const BASE_EVENT: RegistrationEvent = {
  id: "ecr-2026-10",
  title: "eCR Period",
  eventType: "ecr",
  startsAt: "2026-10-12T00:00:00+08:00",
  endsAt: "2026-10-23T23:59:59+08:00",
  sourceLabel: "Test schedule",
  sourceUpdatedAt: "2026-07-01",
};

const OPENING_OFFSET: ReminderOffset = {
  offsetMinutes: 0,
  label: "At opening time",
};

const ONE_DAY_OFFSET: ReminderOffset = {
  offsetMinutes: 24 * 60,
  label: "1 day before",
};

function makeReminder(overrides: Partial<RegistrationReminder>): RegistrationReminder
{
  return {
    id: "event:0",
    eventId: "event",
    eventVersion: "v1",
    channel: "in-app",
    offset: OPENING_OFFSET,
    dueAt: "2026-10-12T00:00:00+08:00",
    visibleFrom: "2026-10-12T00:00:00+08:00",
    visibleUntil: "2026-10-23T23:59:59+08:00",
    remindAt: "2026-10-12T00:00:00+08:00",
    eventStartsAt: "2026-10-12T00:00:00+08:00",
    eventEndsAt: "2026-10-23T23:59:59+08:00",
    title: "Reminder",
    ...overrides,
  };
}

describe("registration reminder timing", () => {
  it("builds deterministic reminder IDs and Singapore +08:00 candidate windows", () => {
    const reminders = buildRegistrationReminderCandidates([BASE_EVENT], {
      channel: "in-app",
      offsets: [ONE_DAY_OFFSET],
    });

    expect(buildReminderId(BASE_EVENT.id, ONE_DAY_OFFSET.offsetMinutes)).toBe("ecr-2026-10:1440");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      id: "ecr-2026-10:1440",
      dueAt: "2026-10-11T00:00:00+08:00",
      visibleFrom: "2026-10-11T00:00:00+08:00",
      visibleUntil: BASE_EVENT.endsAt,
      remindAt: "2026-10-11T00:00:00+08:00",
    });
  });

  it("hides reminders before dueAt, shows them during the window and event, then hides after event end", () => {
    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-10T23:59:59+08:00",
      offsets: [ONE_DAY_OFFSET],
    })).toHaveLength(0);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-11T00:00:00+08:00",
      offsets: [ONE_DAY_OFFSET],
    })).toHaveLength(1);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-12T12:00:00+08:00",
      offsets: [ONE_DAY_OFFSET],
    })).toHaveLength(1);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-24T00:00:00+08:00",
      offsets: [ONE_DAY_OFFSET],
    })).toHaveLength(0);
  });

  it("returns only the most urgent active in-app reminder per event by default", () => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
    });

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("ecr-2026-10:0");
  });

  it("can return all active reminders when most-urgent selection is disabled", () => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
      selectMostUrgentPerEvent: false,
    });

    expect(active.map((reminder) => reminder.id).sort()).toEqual([
      "ecr-2026-10:0",
      "ecr-2026-10:10080",
      "ecr-2026-10:1440",
    ]);
  });

  it("breaks urgency ties by latest dueAt, then smaller absolute offset, then reminder ID", () => {
    const reminders = [
      makeReminder({
        id: "event:latest",
        dueAt: "2026-10-12T00:00:00+08:00",
        offset: { offsetMinutes: 120, label: "Later" },
      }),
      makeReminder({
        id: "event:earlier",
        dueAt: "2026-10-11T00:00:00+08:00",
        offset: { offsetMinutes: 0, label: "Earlier" },
      }),
      makeReminder({
        id: "event:smaller-offset",
        dueAt: "2026-10-12T00:00:00+08:00",
        offset: { offsetMinutes: 60, label: "Smaller offset" },
      }),
      makeReminder({
        id: "event:a-sort",
        dueAt: "2026-10-12T00:00:00+08:00",
        offset: { offsetMinutes: 60, label: "A sort" },
      }),
    ];

    expect(selectMostUrgentRegistrationReminders(reminders)).toHaveLength(1);
    expect(selectMostUrgentRegistrationReminders(reminders)[0].id).toBe("event:a-sort");
  });

  it("supports due push reminders without returning in-app reminders", () => {
    const due = getDueRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
    });

    expect(due.length).toBeGreaterThan(0);
    expect(due.every((reminder) => reminder.channel === "push")).toBe(true);
  });

  it("resolves selected reminder offset minutes through reminder defaults", () => {
    expect(resolveRegistrationReminderOffsets([0, 24 * 60]).map((offset) => offset.offsetMinutes))
      .toEqual([24 * 60, 0]);

    expect(resolveRegistrationReminderOffsets([15]).map((offset) => offset.offsetMinutes))
      .toEqual(DEFAULT_APP_SETTINGS.registrationReminders.offsetMinutes);
  });
});

describe("registration reminder filtering", () => {
  it("hides dismissed reminders for the matching event version", () => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
      dismissedReminders: {
        "ecr-2026-10:0": {
          eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
        },
      },
    });

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("ecr-2026-10:1440");
  });

  it("hides snoozed reminders before snoozedUntil and shows them after", () => {
    const snoozedReminders = {
      "ecr-2026-10:0": {
        reminderId: "ecr-2026-10:0",
        eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
        snoozedUntil: "2026-10-12T02:00:00+08:00",
      },
    };

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-12T01:00:00+08:00",
      snoozedReminders,
    })[0].id).toBe("ecr-2026-10:1440");

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-12T02:00:00+08:00",
      snoozedReminders,
    })[0].id).toBe("ecr-2026-10:0");
  });

  it.each([
    ["startsAt", { startsAt: "2026-10-13T00:00:00+08:00" }],
    ["endsAt", { endsAt: "2026-10-24T23:59:59+08:00" }],
    ["sourceUpdatedAt", { sourceUpdatedAt: "2026-07-02" }],
  ] satisfies Array<[string, Partial<RegistrationEvent>]>)(
    "ignores stale dismissed and snoozed records when %s changes",
    (_, changedFields) => {
      const oldVersion = deriveRegistrationEventVersion(BASE_EVENT);
      const changedEvent = {
        ...BASE_EVENT,
        ...changedFields,
      };

      const active = getActiveInAppRegistrationReminders([changedEvent], {
        now: changedEvent.startsAt,
        dismissedReminders: {
          "ecr-2026-10:0": {
            eventVersion: oldVersion,
          },
        },
        snoozedReminders: {
          "ecr-2026-10:0": {
            reminderId: "ecr-2026-10:0",
            eventVersion: oldVersion,
            snoozedUntil: "2026-10-13T01:00:00+08:00",
          },
        },
      });

      expect(active[0].id).toBe("ecr-2026-10:0");
    },
  );
});

describe("registration validation", () => {
  it("fails duplicate schedule IDs", () => {
    expect(() => assertValidRegistrationSchedule([BASE_EVENT, BASE_EVENT]))
      .toThrow(/duplicate registration event ID/);
  });

  it.each([
    ["startsAt", { startsAt: "2026-10-12" }],
    ["endsAt", { endsAt: "2026-10-23" }],
  ] satisfies Array<[string, Partial<RegistrationEvent>]>)(
    "fails invalid %s ISO datetimes",
    (_, changedFields) => {
      expect(() => assertValidRegistrationSchedule([{ ...BASE_EVENT, ...changedFields }]))
        .toThrow(/full ISO timestamp with \+08:00/);
    },
  );

  it("fails missing titles and source labels", () => {
    expect(() => assertValidRegistrationSchedule([{ ...BASE_EVENT, title: " " }]))
      .toThrow(/missing title/);

    expect(() => assertValidRegistrationSchedule([{ ...BASE_EVENT, sourceLabel: " " }]))
      .toThrow(/missing sourceLabel/);
  });

  it("fails invalid sourceUpdatedAt values", () => {
    expect(() => assertValidRegistrationSchedule([{ ...BASE_EVENT, sourceUpdatedAt: "07/01/2026" }]))
      .toThrow(/invalid sourceUpdatedAt/);
  });

  it("fails when endsAt is not after startsAt", () => {
    expect(() => assertValidRegistrationSchedule([{ ...BASE_EVENT, endsAt: BASE_EVENT.startsAt }]))
      .toThrow(/not after startsAt/);
  });

  it("fails invalid reminder offsets", () => {
    expect(() => assertValidReminderOffsets([{ offsetMinutes: -1, label: "Invalid" }]))
      .toThrow(/invalid offsetMinutes/);

    expect(() => assertValidReminderOffsets([{ offsetMinutes: 60, label: " " }]))
      .toThrow(/missing label/);

    expect(() => assertValidReminderOffsets([
      { offsetMinutes: 60, label: "One hour" },
      { offsetMinutes: 60, label: "Duplicate" },
    ])).toThrow(/duplicate reminder offsetMinutes/);
  });
});

describe("settings normalization", () => {
  it("normalizes legacy boolean reminder settings to preferences", () => {
    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: true,
    }).registrationReminders).toEqual({
      ...DEFAULT_REGISTRATION_REMINDER_PREFERENCES,
      enabled: true,
    });

    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: false,
    }).registrationReminders).toEqual({
      ...DEFAULT_REGISTRATION_REMINDER_PREFERENCES,
      enabled: false,
    });
  });

  it("normalizes malformed old reminder settings safely", () => {
    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: "yes",
    }).registrationReminders).toEqual(DEFAULT_APP_SETTINGS.registrationReminders);
  });

  it("keeps reminder preferences and interaction state separate", () => {
    const settings = normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: {
        enabled: true,
        offsetMinutes: [0, 999, 24 * 60, 0],
        channels: ["push", "sms", "in-app", "in-app"],
        inAppBannerEnabled: false,
        push: {
          enabled: true,
          browserNotificationsEnabled: true,
        },
        dismissedReminders: {
          "ecr-2026-10:0": {
            eventVersion: "old",
          },
        },
        snoozedReminders: {
          "ecr-2026-10:0": {
            reminderId: "ecr-2026-10:0",
            eventVersion: "old",
            snoozedUntil: "2026-10-12T02:00:00+08:00",
          },
        },
      },
    });

    expect(settings.registrationReminders).toEqual({
      enabled: true,
      offsetMinutes: [0, 24 * 60],
      channels: ["in-app"],
      inAppBannerEnabled: false,
      push: {
        enabled: false,
        browserNotificationsEnabled: false,
      },
    });
    expect("dismissedReminders" in settings.registrationReminders).toBe(false);
    expect("snoozedReminders" in settings.registrationReminders).toBe(false);
  });

  it("resets unknown reminder offsets and push-only channels to safe defaults", () => {
    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: {
        enabled: true,
        offsetMinutes: [15, 30],
        channels: ["push"],
      },
    }).registrationReminders).toEqual(DEFAULT_REGISTRATION_REMINDER_PREFERENCES);
  });
});
