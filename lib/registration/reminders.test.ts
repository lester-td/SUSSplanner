import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
} from "@/lib/settings/app-settings";
import {
  EMPTY_LOCAL_REGISTRATION_REMINDER_STATE,
  REGISTRATION_REMINDER_STORAGE_KEY,
  dismissLocalRegistrationReminderInterval,
  dismissLocalRegistrationReminder,
  pruneLocalRegistrationReminderState,
  readLocalRegistrationReminderState,
  snoozeLocalRegistrationReminder,
} from "@/lib/registration/reminder-storage";
import type { RegistrationEvent, ReminderOffset } from "@/lib/registration/types";
import {
  buildRegistrationReminderCandidates,
  buildReminderId,
  DEFAULT_REGISTRATION_REMINDER_OFFSETS,
  deriveRegistrationEventVersion,
  getActiveInAppRegistrationReminders,
  getDueRegistrationReminders,
  resolveRegistrationReminderOffsets,
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

function createMockLocalStorage()
{
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function withMockLocalStorage(run: () => void)
{
  const originalWindow = globalThis.window;
  const localStorage = createMockLocalStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
    },
  });

  try
  {
    run();
  }
  finally
  {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
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

  it("hides in-app reminders more than 7 days before start", () => {
    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-04T23:59:59+08:00",
    })).toHaveLength(0);
  });

  it.each([
    ["168h", "2026-10-05T00:00:00+08:00"],
    ["72h", "2026-10-09T00:00:00+08:00"],
    ["48h", "2026-10-10T00:00:00+08:00"],
    ["24h", "2026-10-11T00:00:00+08:00"],
    ["12h", "2026-10-11T12:00:00+08:00"],
    ["6h", "2026-10-11T18:00:00+08:00"],
    ["1h", "2026-10-11T23:00:00+08:00"],
  ])("shows the upcoming %s threshold", (thresholdKey, now) => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now,
    });

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: `registrationReminder:${BASE_EVENT.id}:upcoming:${thresholdKey}`,
      phase: "upcoming",
      intervalKey: `upcoming:${thresholdKey}`,
      storageKey: `registrationReminder:${BASE_EVENT.id}:upcoming:${thresholdKey}`,
    });
  });

  it("does not show a dismissed upcoming threshold until the next threshold is crossed", () => {
    const currentVersion = deriveRegistrationEventVersion(BASE_EVENT);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-11T06:00:00+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:upcoming:24h`]: {
          eventVersion: currentVersion,
        },
      },
    })).toHaveLength(0);

    const nextThreshold = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-11T12:00:00+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:upcoming:24h`]: {
          eventVersion: currentVersion,
        },
      },
    });

    expect(nextThreshold[0].intervalKey).toBe("upcoming:12h");
  });

  it("shows a green open reminder immediately at start", () => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
    });

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: `registrationReminder:${BASE_EVENT.id}:open:day-0`,
      phase: "open",
      intervalKey: "open:day-0",
    });
  });

  it("reappears only every 24 hours while open after dismissal", () => {
    const currentVersion = deriveRegistrationEventVersion(BASE_EVENT);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-12T12:00:00+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: currentVersion,
        },
      },
    })).toHaveLength(0);

    const nextOpenReminder = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-13T00:00:00+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: currentVersion,
        },
      },
    });

    expect(nextOpenReminder[0].intervalKey).toBe("open:day-1");
  });

  it.each([
    ["24h", "2026-10-22T23:59:59+08:00"],
    ["12h", "2026-10-23T11:59:59+08:00"],
    ["6h", "2026-10-23T17:59:59+08:00"],
    ["1h", "2026-10-23T22:59:59+08:00"],
  ])("shows the closing %s threshold only in the final day", (thresholdKey, now) => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now,
    });

    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: `registrationReminder:${BASE_EVENT.id}:closing:${thresholdKey}`,
      phase: "closing",
      intervalKey: `closing:${thresholdKey}`,
    });
  });

  it("does not show a dismissed closing threshold until the next threshold is crossed", () => {
    const currentVersion = deriveRegistrationEventVersion(BASE_EVENT);

    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-23T05:59:59+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:closing:24h`]: {
          eventVersion: currentVersion,
        },
      },
    })).toHaveLength(0);

    const nextThreshold = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-23T11:59:59+08:00",
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:closing:24h`]: {
          eventVersion: currentVersion,
        },
      },
    });

    expect(nextThreshold[0].intervalKey).toBe("closing:12h");
  });

  it("hides ended windows", () => {
    expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: "2026-10-24T00:00:00+08:00",
    })).toHaveLength(0);
  });

  it("does not stack multiple active in-app reminders", () => {
    const secondEvent: RegistrationEvent = {
      ...BASE_EVENT,
      id: "add-drop-2026-10",
      title: "Add-Drop Period",
      startsAt: "2026-10-13T00:00:00+08:00",
      endsAt: "2026-10-24T23:59:59+08:00",
      eventType: "add-drop",
    };
    const active = getActiveInAppRegistrationReminders([BASE_EVENT, secondEvent], {
      now: "2026-10-12T00:00:00+08:00",
    });

    expect(active).toHaveLength(1);
    expect(active[0].eventId).toBe(BASE_EVENT.id);
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
      .toEqual(DEFAULT_REGISTRATION_REMINDER_OFFSETS.map((offset) => offset.offsetMinutes));
  });
});

describe("registration reminder filtering", () => {
  it("hides dismissed interval reminders for the matching event version", () => {
    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
        },
      },
    });

    expect(active).toHaveLength(0);
  });

  it.each([
    ["startsAt", { startsAt: "2026-10-13T00:00:00+08:00" }],
    ["endsAt", { endsAt: "2026-10-24T23:59:59+08:00" }],
    ["sourceUpdatedAt", { sourceUpdatedAt: "2026-07-02" }],
  ] satisfies Array<[string, Partial<RegistrationEvent>]>)(
    "ignores stale dismissed records when %s changes",
    (_, changedFields) => {
      const oldVersion = deriveRegistrationEventVersion(BASE_EVENT);
      const changedEvent = {
        ...BASE_EVENT,
        ...changedFields,
      };

      const active = getActiveInAppRegistrationReminders([changedEvent], {
        now: changedEvent.startsAt,
        dismissedIntervals: {
          [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
            eventVersion: oldVersion,
          },
        },
      });

      expect(active[0].id).toBe(`registrationReminder:${BASE_EVENT.id}:open:day-0`);
    },
  );

  it("ignores legacy snoozed events for the threshold-based banner", () => {
    const currentVersion = deriveRegistrationEventVersion(BASE_EVENT);

    const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
      now: BASE_EVENT.startsAt,
      snoozedEvents: {
        "ecr-2026-10": {
          eventVersion: currentVersion,
        },
      },
    });

    expect(active).toHaveLength(1);
    expect(active[0].intervalKey).toBe("open:day-0");
  });
});

describe("registration reminder storage", () => {
  it("stores dismissed records keyed by reminder ID with eventVersion only", () => {
    withMockLocalStorage(() => {
      const reminder = buildRegistrationReminderCandidates([BASE_EVENT], {
        channel: "in-app",
        offsets: [OPENING_OFFSET],
      })[0];
      const state = dismissLocalRegistrationReminder(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      expect(state.dismissedReminders).toEqual({
        [`${BASE_EVENT.id}:0`]: {
          eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
        },
      });
      expect(state.dismissedIntervals).toEqual({});
      expect(state.snoozedEvents).toEqual({});
      expect(state.dismissedReminders[`${BASE_EVENT.id}:0`]).not.toHaveProperty("reminderId");
      expect(JSON.parse(window.localStorage.getItem(REGISTRATION_REMINDER_STORAGE_KEY) ?? "{}"))
        .toEqual(state);
    });
  });

  it("stores dismissed interval records keyed by window and threshold", () => {
    withMockLocalStorage(() => {
      const reminder = getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
      })[0];
      const state = dismissLocalRegistrationReminderInterval(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      expect(state).toEqual({
        dismissedReminders: {},
        dismissedIntervals: {
          [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
        snoozedEvents: {},
      });
      expect(JSON.parse(window.localStorage.getItem(REGISTRATION_REMINDER_STORAGE_KEY) ?? "{}"))
        .toEqual(state);
    });
  });

  it("applies dismissed interval storage to active reminders", () => {
    withMockLocalStorage(() => {
      const reminder = getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
      })[0];
      const state = dismissLocalRegistrationReminderInterval(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      const active = getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
        dismissedIntervals: state.dismissedIntervals,
      });

      expect(active).toHaveLength(0);
    });
  });

  it("keeps snoozeLocalRegistrationReminder as an interval dismissal alias", () => {
    withMockLocalStorage(() => {
      const reminder = getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
      })[0];
      const state = snoozeLocalRegistrationReminder(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      expect(state.dismissedIntervals).toEqual({
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
        },
      });
      expect(state.snoozedEvents).toEqual({});
    });
  });

  it.each([
    ["startsAt", { startsAt: "2026-10-13T00:00:00+08:00" }],
    ["endsAt", { endsAt: "2026-10-24T23:59:59+08:00" }],
    ["sourceUpdatedAt", { sourceUpdatedAt: "2026-07-02" }],
  ] satisfies Array<[string, Partial<RegistrationEvent>]>)(
    "prunes old dismissed records when %s changes",
    (_, changedFields) => {
      const reminderId = `registrationReminder:${BASE_EVENT.id}:open:day-0`;
      const oldVersion = deriveRegistrationEventVersion(BASE_EVENT);
      const changedEvent = {
        ...BASE_EVENT,
        ...changedFields,
      };

      expect(pruneLocalRegistrationReminderState({
        dismissedReminders: {
          [reminderId]: {
            eventVersion: oldVersion,
          },
        },
        dismissedIntervals: {
          [reminderId]: {
            eventVersion: oldVersion,
          },
        },
      }, {
        events: [changedEvent],
        now: BASE_EVENT.startsAt,
      })).toEqual(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE);
    },
  );

  it("normalizes malformed reminder storage safely", () => {
    withMockLocalStorage(() => {
      window.localStorage.setItem(REGISTRATION_REMINDER_STORAGE_KEY, JSON.stringify({
        dismissedReminders: {
          [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
            eventVersion: 123,
          },
          "ecr-2026-10:1440": {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
            reminderId: "should-not-persist",
          },
        },
        dismissedIntervals: {
          [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
            reminderId: "should-not-persist",
          },
          "registrationReminder:missing:open:day-0": {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
        snoozedEvents: {
          "ecr-2026-10": {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
        snoozedReminders: {
          "ecr-2026-10:0": {
            reminderId: "ecr-2026-10:0",
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
            snoozedUntil: "2026-10-12T02:00:00+08:00",
          },
        },
      }));

      expect(readLocalRegistrationReminderState({
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      })).toEqual({
        dismissedReminders: {
          "ecr-2026-10:1440": {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
        dismissedIntervals: {
          [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
        snoozedEvents: {
          "ecr-2026-10": {
            eventVersion: deriveRegistrationEventVersion(BASE_EVENT),
          },
        },
      });
    });
  });

  it("prunes stale reminder records", () => {
    const currentVersion = deriveRegistrationEventVersion(BASE_EVENT);
    const state = {
      dismissedReminders: {
        "ecr-2026-10:0": {
          eventVersion: currentVersion,
        },
        "missing:0": {
          eventVersion: currentVersion,
        },
      },
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: currentVersion,
        },
        "registrationReminder:missing:open:day-0": {
          eventVersion: currentVersion,
        },
      },
      snoozedEvents: {
        "ecr-2026-10": {
          eventVersion: currentVersion,
        },
        "missing": {
          eventVersion: currentVersion,
        },
      },
    };

    expect(pruneLocalRegistrationReminderState(state, {
      events: [BASE_EVENT],
      now: "2026-10-12T00:30:00+08:00",
    })).toEqual({
      dismissedReminders: {
        "ecr-2026-10:0": {
          eventVersion: currentVersion,
        },
      },
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: currentVersion,
        },
      },
      snoozedEvents: {
        "ecr-2026-10": {
          eventVersion: currentVersion,
        },
      },
    });

    expect(pruneLocalRegistrationReminderState(state, {
      events: [BASE_EVENT],
      now: "2026-10-12T01:30:00+08:00",
    })).toEqual({
      dismissedReminders: {
        "ecr-2026-10:0": {
          eventVersion: currentVersion,
        },
      },
      dismissedIntervals: {
        [`registrationReminder:${BASE_EVENT.id}:open:day-0`]: {
          eventVersion: currentVersion,
        },
      },
      snoozedEvents: {
        "ecr-2026-10": {
          eventVersion: currentVersion,
        },
      },
    });

    expect(pruneLocalRegistrationReminderState(state, {
      events: [BASE_EVENT],
      now: "2026-10-24T00:00:00+08:00",
    })).toEqual(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE);

    expect(pruneLocalRegistrationReminderState(state, {
      events: [],
      now: BASE_EVENT.startsAt,
    })).toEqual(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE);
  });

  it("combines reminder preferences with dismissed reminder state", () => {
    withMockLocalStorage(() => {
      const reminder = getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
      })[0];
      const dismissedState = dismissLocalRegistrationReminderInterval(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
        dismissedIntervals: dismissedState.dismissedIntervals,
      })).toHaveLength(0);

      const snoozedState = snoozeLocalRegistrationReminder(reminder, {
        events: [BASE_EVENT],
        now: BASE_EVENT.startsAt,
      });

      expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: BASE_EVENT.startsAt,
        dismissedIntervals: snoozedState.dismissedIntervals,
      })).toHaveLength(0);

      expect(getActiveInAppRegistrationReminders([BASE_EVENT], {
        now: "2026-10-13T00:00:00+08:00",
        dismissedIntervals: snoozedState.dismissedIntervals,
      })[0].intervalKey).toBe("open:day-1");
    });
  });
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
  it("defaults non-object reminder settings", () => {
    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: true,
    }).registrationReminders).toEqual(DEFAULT_APP_SETTINGS.registrationReminders);

    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: false,
    }).registrationReminders).toEqual(DEFAULT_APP_SETTINGS.registrationReminders);

    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: "yes",
    }).registrationReminders).toEqual(DEFAULT_APP_SETTINGS.registrationReminders);
  });

  it("normalizes object reminder settings to the enabled flag", () => {
    const settings = normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: {
        enabled: true,
      },
    });

    expect(settings.registrationReminders).toEqual({
      enabled: true,
    });
  });

  it("defaults object reminder settings when enabled is missing", () => {
    expect(normalizeAppSettings({
      ...DEFAULT_APP_SETTINGS,
      registrationReminders: {},
    }).registrationReminders).toEqual(DEFAULT_APP_SETTINGS.registrationReminders);
  });
});
