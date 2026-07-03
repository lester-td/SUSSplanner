import type {
  LocalRegistrationReminderState,
  RegistrationEvent,
  RegistrationReminder,
} from "@/lib/registration/types";
import {
  DEFAULT_REGISTRATION_REMINDER_OFFSETS,
  buildRegistrationReminderCandidates,
  deriveRegistrationEventVersion,
  parseRegistrationReminderTimestamp,
} from "@/lib/registration/reminders";

export const REGISTRATION_REMINDER_STORAGE_KEY = "sussplanner:registration-reminders";

export type ReminderStorageContext = {
  events: readonly RegistrationEvent[];
  now?: Date | string | number;
};

type CurrentReminderRecord = {
  eventVersion: string;
  eventEndsAt: string;
};

export const EMPTY_LOCAL_REGISTRATION_REMINDER_STATE: LocalRegistrationReminderState = {
  dismissedReminders: {},
  snoozedEvents: {},
};

function canUseLocalStorage()
{
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getNowTimestamp(now: Date | string | number | undefined)
{
  if (typeof now === "undefined")
  {
    return Date.now();
  }

  return parseRegistrationReminderTimestamp(now) ?? Date.now();
}

function cloneEmptyLocalRegistrationReminderState(): LocalRegistrationReminderState
{
  return {
    dismissedReminders: {},
    snoozedEvents: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown>
{
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLocalRegistrationReminderState(value: unknown): LocalRegistrationReminderState
{
  if (!isRecord(value))
  {
    return cloneEmptyLocalRegistrationReminderState();
  }

  const dismissedReminders: LocalRegistrationReminderState["dismissedReminders"] = {};
  const snoozedEvents: LocalRegistrationReminderState["snoozedEvents"] = {};
  const dismissedCandidate = value.dismissedReminders;
  const snoozedEventsCandidate = value.snoozedEvents;
  const snoozedCandidate = value.snoozedReminders;

  if (isRecord(dismissedCandidate))
  {
    Object.entries(dismissedCandidate).forEach(([reminderId, record]) => {
      if (!isRecord(record) || typeof record.eventVersion !== "string" || !record.eventVersion.trim())
      {
        return;
      }

      dismissedReminders[reminderId] = {
        eventVersion: record.eventVersion,
      };
    });
  }

  if (isRecord(snoozedEventsCandidate))
  {
    Object.entries(snoozedEventsCandidate).forEach(([eventId, record]) => {
      if (!isRecord(record) || typeof record.eventVersion !== "string" || !record.eventVersion.trim())
      {
        return;
      }

      snoozedEvents[eventId] = {
        eventVersion: record.eventVersion,
      };
    });
  }

  if (isRecord(snoozedCandidate))
  {
    Object.entries(snoozedCandidate).forEach(([reminderId, record]) => {
      if (
        !isRecord(record)
        || typeof record.eventVersion !== "string"
        || !record.eventVersion.trim()
      )
      {
        return;
      }

      const [eventId] = reminderId.split(":");

      if (!eventId)
      {
        return;
      }

      snoozedEvents[eventId] = {
        eventVersion: record.eventVersion,
      };
    });
  }

  return {
    dismissedReminders,
    snoozedEvents,
  };
}

function getCurrentReminderRecords(events: readonly RegistrationEvent[])
{
  const currentReminderRecords = new Map<string, CurrentReminderRecord>();

  buildRegistrationReminderCandidates(events, {
    channel: "in-app",
    offsets: DEFAULT_REGISTRATION_REMINDER_OFFSETS,
  }).forEach((reminder) => {
    currentReminderRecords.set(reminder.id, {
      eventVersion: reminder.eventVersion,
      eventEndsAt: reminder.eventEndsAt,
    });
  });

  return currentReminderRecords;
}

function getCurrentEventRecords(events: readonly RegistrationEvent[])
{
  const currentEventRecords = new Map<string, CurrentReminderRecord>();

  events.forEach((event) => {
    currentEventRecords.set(event.id, {
      eventVersion: deriveRegistrationEventVersion(event),
      eventEndsAt: event.endsAt,
    });
  });

  return currentEventRecords;
}

function isCurrentReminderRecordStale(
  record: CurrentReminderRecord | undefined,
  eventVersion: string,
  nowTimestamp: number,
)
{
  if (!record || record.eventVersion !== eventVersion)
  {
    return true;
  }

  const eventEndsAtTimestamp = parseRegistrationReminderTimestamp(record.eventEndsAt);

  return eventEndsAtTimestamp !== null && nowTimestamp > eventEndsAtTimestamp;
}

export function pruneLocalRegistrationReminderState(
  state: unknown,
  { events, now }: ReminderStorageContext,
): LocalRegistrationReminderState
{
  const normalizedState = normalizeLocalRegistrationReminderState(state);
  const currentReminderRecords = getCurrentReminderRecords(events);
  const currentEventRecords = getCurrentEventRecords(events);
  const nowTimestamp = getNowTimestamp(now);
  const prunedState = cloneEmptyLocalRegistrationReminderState();

  Object.entries(normalizedState.dismissedReminders).forEach(([reminderId, record]) => {
    if (isCurrentReminderRecordStale(currentReminderRecords.get(reminderId), record.eventVersion, nowTimestamp))
    {
      return;
    }

    prunedState.dismissedReminders[reminderId] = {
      eventVersion: record.eventVersion,
    };
  });

  Object.entries(normalizedState.snoozedEvents).forEach(([eventId, record]) => {
    if (isCurrentReminderRecordStale(currentEventRecords.get(eventId), record.eventVersion, nowTimestamp))
    {
      return;
    }

    prunedState.snoozedEvents[eventId] = {
      eventVersion: record.eventVersion,
    };
  });

  return prunedState;
}

export function readLocalRegistrationReminderState(context: ReminderStorageContext): LocalRegistrationReminderState
{
  if (!canUseLocalStorage())
  {
    return pruneLocalRegistrationReminderState(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE, context);
  }

  const stored = window.localStorage.getItem(REGISTRATION_REMINDER_STORAGE_KEY);

  if (!stored)
  {
    return pruneLocalRegistrationReminderState(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE, context);
  }

  try
  {
    const prunedState = pruneLocalRegistrationReminderState(JSON.parse(stored), context);
    window.localStorage.setItem(REGISTRATION_REMINDER_STORAGE_KEY, JSON.stringify(prunedState));
    return prunedState;
  }
  catch
  {
    const prunedState = pruneLocalRegistrationReminderState(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE, context);
    window.localStorage.setItem(REGISTRATION_REMINDER_STORAGE_KEY, JSON.stringify(prunedState));
    return prunedState;
  }
}

export function saveLocalRegistrationReminderState(
  state: LocalRegistrationReminderState,
  context: ReminderStorageContext,
)
{
  const prunedState = pruneLocalRegistrationReminderState(state, context);

  if (canUseLocalStorage())
  {
    window.localStorage.setItem(REGISTRATION_REMINDER_STORAGE_KEY, JSON.stringify(prunedState));
  }

  return prunedState;
}

export function dismissLocalRegistrationReminder(
  reminder: RegistrationReminder,
  context: ReminderStorageContext,
)
{
  const currentState = readLocalRegistrationReminderState(context);
  const nextState: LocalRegistrationReminderState = {
    dismissedReminders: {
      ...currentState.dismissedReminders,
      [reminder.id]: {
        eventVersion: reminder.eventVersion,
      },
    },
    snoozedEvents: currentState.snoozedEvents,
  };

  return saveLocalRegistrationReminderState(nextState, context);
}

export function snoozeLocalRegistrationReminder(
  reminder: RegistrationReminder,
  context: ReminderStorageContext,
)
{
  const currentState = readLocalRegistrationReminderState(context);
  const nextState: LocalRegistrationReminderState = {
    dismissedReminders: currentState.dismissedReminders,
    snoozedEvents: {
      ...currentState.snoozedEvents,
      [reminder.eventId]: {
        eventVersion: reminder.eventVersion,
      },
    },
  };

  return saveLocalRegistrationReminderState(nextState, context);
}
