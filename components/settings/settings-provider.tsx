"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import {
  APP_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_UPDATED_EVENT,
  readAppSettings,
  type ColorSchemePreference,
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

    applyColorScheme();
    mediaQuery.addEventListener("change", handleSettingsChange);
    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSettingsChange);
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, handleSettingsChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return children;
}
