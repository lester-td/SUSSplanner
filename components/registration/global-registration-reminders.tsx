"use client";

import { useEffect, useMemo, useState } from "react";

import { RegistrationReminderBanner } from "@/components/registration/registration-reminder-banner";
import {
  getActiveInAppRegistrationReminders,
  resolveRegistrationReminderOffsets,
} from "@/lib/registration/reminders";
import {
  EMPTY_LOCAL_REGISTRATION_REMINDER_STATE,
  REGISTRATION_REMINDER_STORAGE_KEY,
  dismissLocalRegistrationReminder,
  readLocalRegistrationReminderState,
  snoozeLocalRegistrationReminder,
} from "@/lib/registration/reminder-storage";
import { REGISTRATION_EVENTS } from "@/lib/registration/schedule";
import {
  APP_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_UPDATED_EVENT,
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  type SettingsState,
} from "@/lib/settings/app-settings";
import type { RegistrationReminder } from "@/lib/registration/types";

export function GlobalRegistrationReminders()
{
  const [ready, setReady] = useState(false);
  const [appSettings, setAppSettings] = useState<SettingsState>(DEFAULT_APP_SETTINGS);
  const [reminderInteractionState, setReminderInteractionState] = useState(EMPTY_LOCAL_REGISTRATION_REMINDER_STATE);
  const [reminderNow, setReminderNow] = useState(() => Date.now());

  const syncReminderInteractionState = () => {
    const now = Date.now();

    setReminderNow(now);
    setReminderInteractionState(readLocalRegistrationReminderState({
      events: REGISTRATION_EVENTS,
      now,
    }));
  };

  useEffect(() => {
    setAppSettings(readAppSettings());
    syncReminderInteractionState();
    setReady(true);
  }, []);

  useEffect(() => {
    const syncAppSettings = () => setAppSettings(readAppSettings());
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEY)
      {
        syncAppSettings();
      }
    };

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, syncAppSettings);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, syncAppSettings);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === REGISTRATION_REMINDER_STORAGE_KEY)
      {
        syncReminderInteractionState();
      }
    };
    const intervalId = window.setInterval(syncReminderInteractionState, 60 * 1000);

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const activeRegistrationReminders = useMemo(() => {
    const reminderPreferences = appSettings.registrationReminders;
    const inAppRemindersEnabled = reminderPreferences.enabled
      && reminderPreferences.inAppBannerEnabled
      && reminderPreferences.channels.includes("in-app");

    if (!ready || !inAppRemindersEnabled)
    {
      return [];
    }

    return getActiveInAppRegistrationReminders(REGISTRATION_EVENTS, {
      enabled: inAppRemindersEnabled,
      dismissedReminders: reminderInteractionState.dismissedReminders,
      now: reminderNow,
      offsets: resolveRegistrationReminderOffsets(reminderPreferences.offsetMinutes),
    });
  }, [appSettings.registrationReminders, ready, reminderInteractionState, reminderNow]);

  function handleDismissRegistrationReminder(reminder: RegistrationReminder)
  {
    const now = Date.now();

    setReminderNow(now);
    setReminderInteractionState(dismissLocalRegistrationReminder(reminder, {
      events: REGISTRATION_EVENTS,
      now,
    }));
  }

  function handleSnoozeRegistrationReminder(reminder: RegistrationReminder)
  {
    const now = Date.now();

    setReminderNow(now);
    setReminderInteractionState(snoozeLocalRegistrationReminder(reminder, {
      events: REGISTRATION_EVENTS,
      now,
    }));
  }

  return (
    <RegistrationReminderBanner
      reminders={activeRegistrationReminders}
      onDismissReminder={handleDismissRegistrationReminder}
      onSnoozeReminder={handleSnoozeRegistrationReminder}
      variant="notification"
    />
  );
}
