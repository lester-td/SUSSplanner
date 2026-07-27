"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import {
  APP_THEME_OPTIONS,
  APP_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_UPDATED_EVENT,
  announceAppSettingsUpdated,
  readAppSettings,
  saveAppSettings,
  type ColorSchemePreference,
  type SettingsState,
} from "@/lib/settings/app-settings";

function resolveColorScheme(preference: ColorSchemePreference)
{
  if (preference === "dark" || preference === "light")
  {
    return preference;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyColorScheme()
{
  const settings = readAppSettings();
  const resolvedScheme = resolveColorScheme(settings.colorScheme);
  document.documentElement.dataset.colorScheme = resolvedScheme;
  document.documentElement.style.colorScheme = resolvedScheme;
}

function updateAppSettings(nextSettings: Partial<SettingsState>)
{
  saveAppSettings({
    ...readAppSettings(),
    ...nextSettings,
  });
  announceAppSettingsUpdated();
}

function cycleTheme(direction: 1 | -1)
{
  const settings = readAppSettings();
  const currentIndex = APP_THEME_OPTIONS.findIndex((theme) => theme.id === settings.themeId);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (
    safeCurrentIndex
    + direction
    + APP_THEME_OPTIONS.length
  ) % APP_THEME_OPTIONS.length;

  updateAppSettings({ themeId: APP_THEME_OPTIONS[nextIndex].id });
}

function toggleColorScheme()
{
  const settings = readAppSettings();
  const resolvedScheme = resolveColorScheme(settings.colorScheme);
  updateAppSettings({ colorScheme: resolvedScheme === "dark" ? "light" : "dark" });
}

function isEditableShortcutTarget(target: EventTarget | null)
{
  if (!(target instanceof HTMLElement))
  {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || target.isContentEditable
    || Boolean(target.closest("[contenteditable='true'], [role='textbox']"));
}

export function SettingsProvider({ children }: { children: ReactNode })
{
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSettingsChange = () => applyColorScheme();
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEY)
      {
        applyColorScheme();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.repeat
        || event.isComposing
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || isEditableShortcutTarget(event.target)
      )
      {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "x")
      {
        event.preventDefault();
        toggleColorScheme();
      }
      else if (key === "c")
      {
        event.preventDefault();
        cycleTheme(1);
      }
      else if (key === "z")
      {
        event.preventDefault();
        cycleTheme(-1);
      }
    };

    applyColorScheme();
    mediaQuery.addEventListener("change", handleSettingsChange);
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      mediaQuery.removeEventListener("change", handleSettingsChange);
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return children;
}
