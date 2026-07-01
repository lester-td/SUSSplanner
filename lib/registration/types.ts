export type RegistrationEventType = "ecr" | "add-drop" | "other";

export type ReminderChannel = "in-app" | "push";

export type ReminderOffset = {
  offsetMinutes: number;
  label: string;
};

export type RegistrationEvent = {
  id: string;
  title: string;
  eventType: RegistrationEventType;
  startsAt: string;
  endsAt: string;
  scheduleVersion?: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
};

export type RegistrationReminder = {
  id: string;
  eventId: string;
  eventVersion: string;
  channel: ReminderChannel;
  offset: ReminderOffset;
  remindAt: string;
  eventStartsAt: string;
  title: string;
  body?: string;
};

export type DismissedRegistrationReminder = {
  eventVersion: string;
};

export type SnoozedRegistrationReminder = {
  reminderId: string;
  eventVersion: string;
  snoozedUntil: string;
};

export type LocalRegistrationReminderState = {
  dismissedReminders: Record<string, { eventVersion: string }>;
  snoozedReminders: Record<string, { reminderId: string; eventVersion: string; snoozedUntil: string }>;
};
