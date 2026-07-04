"use client";

import { useEffect, useMemo, useState } from "react";

import { RegistrationReminderBanner } from "@/components/registration/registration-reminder-banner";
import { getActiveInAppRegistrationReminders } from "@/lib/registration/reminders";
import {
  EMPTY_LOCAL_REGISTRATION_REMINDER_STATE,
  REGISTRATION_REMINDER_POPUP_REQUESTED_EVENT,
  REGISTRATION_REMINDER_STORAGE_KEY,
  REGISTRATION_REMINDER_STATE_UPDATED_EVENT,
  dismissLocalRegistrationReminderInterval,
  readLocalRegistrationReminderState,
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
  const [manualRegistrationReminders, setManualRegistrationReminders] = useState<RegistrationReminder[]>([]);
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

    window.addEventListener(REGISTRATION_REMINDER_STATE_UPDATED_EVENT, syncReminderInteractionState);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(REGISTRATION_REMINDER_STATE_UPDATED_EVENT, syncReminderInteractionState);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleReminderPopupRequested = () => {
      const now = Date.now();
      const [reminder] = getActiveInAppRegistrationReminders(REGISTRATION_EVENTS, {
        enabled: true,
        now,
      });

      if (!reminder)
      {
        return;
      }

      setReminderNow(now);
      setManualRegistrationReminders((currentReminders) => [
        ...currentReminders,
        {
          ...reminder,
          id: `${reminder.id}:manual:${now}:${currentReminders.length}`,
          storageKey: reminder.storageKey ?? reminder.id,
        },
      ]);
    };

    window.addEventListener(REGISTRATION_REMINDER_POPUP_REQUESTED_EVENT, handleReminderPopupRequested);

    return () => {
      window.removeEventListener(REGISTRATION_REMINDER_POPUP_REQUESTED_EVENT, handleReminderPopupRequested);
    };
  }, []);

  const activeRegistrationReminders = useMemo(() => {
    const reminderPreferences = appSettings.registrationReminders;
    const inAppRemindersEnabled = reminderPreferences.enabled;

    if (!ready || !inAppRemindersEnabled)
    {
      return [];
    }

    return getActiveInAppRegistrationReminders(REGISTRATION_EVENTS, {
      enabled: inAppRemindersEnabled,
      dismissedReminders: reminderInteractionState.dismissedReminders,
      dismissedIntervals: reminderInteractionState.dismissedIntervals,
      now: reminderNow,
    });
  }, [appSettings.registrationReminders, ready, reminderInteractionState, reminderNow]);

  function handleCloseRegistrationReminder(reminder: RegistrationReminder)
  {
    if (reminder.id.includes(":manual:"))
    {
      setManualRegistrationReminders((currentReminders) => (
        currentReminders.filter((currentReminder) => currentReminder.id !== reminder.id)
      ));
      return;
    }

    const now = Date.now();

    setReminderInteractionState(dismissLocalRegistrationReminderInterval(reminder, {
      events: REGISTRATION_EVENTS,
      now,
    }));
    setReminderNow(now);
  }

  return (
    <RegistrationReminderBanner
      reminders={[...activeRegistrationReminders, ...manualRegistrationReminders]}
      onCloseReminder={handleCloseRegistrationReminder}
      variant="notification"
    />
  );
}
