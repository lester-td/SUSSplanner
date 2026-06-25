"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  CalendarWeekIcon,
  RefreshIcon,
} from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";
import {
  APP_THEME_OPTIONS,
  DEFAULT_APP_SETTINGS,
  announceAppSettingsUpdated,
  getThemeOption,
  readAppSettings,
  saveAppSettings,
  type SettingsState,
  type ThemeOption,
} from "@/lib/settings/app-settings";

const PREVIEW_BLOCKS = [
  {
    day: "Mon",
    time: "10:00",
    course: "ICT239",
    title: "Web Application Development",
    colorIndex: 0,
    column: "col-start-2",
    row: "row-start-2 row-span-2",
  },
  {
    day: "Tue",
    time: "14:00",
    course: "MTH219",
    title: "Statistics for Data Science",
    colorIndex: 1,
    column: "col-start-3",
    row: "row-start-4 row-span-2",
  },
  {
    day: "Wed",
    time: "19:00",
    course: "BUS105",
    title: "Business Communication",
    colorIndex: 2,
    column: "col-start-4",
    row: "row-start-7 row-span-2",
  },
  {
    day: "Thu",
    time: "12:00",
    course: "FIN201",
    title: "Corporate Finance",
    colorIndex: 3,
    column: "col-start-5",
    row: "row-start-3 row-span-2",
  },
  {
    day: "Mon",
    time: "16:00",
    course: "PSY107",
    title: "Introduction to Psychology",
    colorIndex: 4,
    column: "col-start-2",
    row: "row-start-6 row-span-2",
  },
  {
    day: "Tue",
    time: "09:00",
    course: "SCO101",
    title: "Why Do Good?",
    colorIndex: 5,
    column: "col-start-3",
    row: "row-start-2 row-span-2",
  },
  {
    day: "Wed",
    time: "12:00",
    course: "ANL201",
    title: "Analytics for Decision Making",
    colorIndex: 6,
    column: "col-start-4",
    row: "row-start-3 row-span-2",
  },
  {
    day: "Thu",
    time: "19:00",
    course: "LAW101",
    title: "Legal Methods",
    colorIndex: 7,
    column: "col-start-5",
    row: "row-start-7 row-span-2",
  },
] as const;

function getPreviewTextColor(hexColor: string)
{
  const normalized = hexColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized))
  {
    return "#111827";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgb(${Math.round(red * 0.18)} ${Math.round(green * 0.18)} ${Math.round(blue * 0.18)})`;
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
})
{
  return (
    <section id={id} className="border-t border-[var(--outline-variant)] py-7 first:border-t-0 first:pt-0">
      <h2 className="text-[20px] font-bold leading-7 text-[var(--on-surface)]">{title}</h2>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
})
{
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,auto)] md:items-center">
      <div>
        <h3 className="text-[15px] font-bold leading-6 text-[var(--on-surface)]">{title}</h3>
        <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[var(--on-surface-variant)]">
          {description}
        </p>
      </div>
      <div className="flex md:justify-end">{children}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
})
{
  return (
    <div
      className="inline-flex rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-1"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`rounded px-3 py-1.5 text-[13px] font-bold transition ${
              selected
                ? "bg-[var(--primary)] text-[var(--on-primary)] shadow-sm"
                : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
            }`}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ThemePicker({
  selectedThemeId,
  onSelectTheme,
}: {
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
})
{
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {APP_THEME_OPTIONS.map((theme) => {
        const selected = theme.id === selectedThemeId;

        return (
          <button
            key={theme.id}
            type="button"
            className={`rounded-lg border bg-[var(--surface-container-lowest)] p-4 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] ${
              selected ? "border-[var(--primary)] ring-2 ring-[var(--primary-ring-soft)]" : "border-[var(--outline-variant)]"
            }`}
            aria-pressed={selected}
            onClick={() => onSelectTheme(theme.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-[var(--on-surface)]">{theme.name}</span>
              <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
                {selected ? "Selected" : "Choose"}
              </span>
            </div>
            <ul className="mt-4 grid grid-cols-8 gap-1.5" aria-label={`${theme.name} colors`}>
              {theme.colors.map((color) => (
                <li
                  key={color}
                  className="h-8 rounded border border-b-4 border-black/10"
                  style={{
                    backgroundColor: color,
                    borderBottomColor: `color-mix(in srgb, ${color}, #000 24%)`,
                  }}
                />
              ))}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

function TimetablePreview({
  settings,
  theme,
}: {
  settings: SettingsState;
  theme: ThemeOption;
})
{
  const isVertical = settings.timetableOrientation === "vertical";
  const days = ["", "Mon", "Tue", "Wed", "Thu"];
  const times = ["09:00", "10:00", "12:00", "14:00", "16:00", "19:00", "21:00"];

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--outline-variant)] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarWeekIcon className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[13px] font-bold text-[var(--on-surface)]">Theme preview</span>
        </div>
        <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
          {isVertical ? "Vertical" : "Horizontal"}
        </span>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-5 grid-rows-8 gap-1 text-[11px] leading-4">
          {days.map((day) => (
            <div key={day || "axis"} className="min-h-8 rounded bg-[var(--surface-container-low)] px-2 py-2 font-bold text-[var(--on-surface-variant)]">
              {day}
            </div>
          ))}
          {times.map((time) => (
            <div key={time} className="rounded bg-[var(--surface-container-low)] px-2 py-2 font-semibold text-[var(--on-surface-variant)]">
              {time}
            </div>
          ))}
          {Array.from({ length: 28 }).map((_, index) => (
            <div key={index} className="min-h-8 rounded bg-[var(--surface-container-lowest)] ring-1 ring-[var(--outline-variant)]" />
          ))}
          {PREVIEW_BLOCKS.map((block) => (
            <div
              key={`${block.day}-${block.course}`}
              className={`timetable-cell z-10 ${block.column} ${block.row}`}
              style={{
                "--block-bg": theme.colors[block.colorIndex],
                "--block-border": theme.colors[block.colorIndex],
                "--block-text": getPreviewTextColor(theme.colors[block.colorIndex]),
              } as CSSProperties}
            >
              <span className="timetable-cell__module truncate">{block.course}</span>
              {!isVertical ? (
                <span className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4">
                  {block.title}
                </span>
              ) : null}
              <span className="timetable-cell__time mt-auto">{block.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsClient()
{
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_APP_SETTINGS);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(readAppSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    saveAppSettings(settings);
    announceAppSettingsUpdated();
  }, [ready, settings]);

  const selectedTheme = useMemo(
    () => getThemeOption(settings.themeId),
    [settings.themeId],
  );

  function updateSettings(nextSettings: Partial<SettingsState>)
  {
    setSettings((currentSettings) => ({
      ...currentSettings,
      ...nextSettings,
    }));
  }

  function resetSettings()
  {
    setSettings(DEFAULT_APP_SETTINGS);
    setResetConfirmOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[32px] font-black leading-10 text-[var(--on-surface)]">
            Settings
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[var(--on-surface-variant)]">
            Customise how SUSS Planner looks and behaves on this browser.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-2 text-[13px] font-bold text-[var(--on-surface)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)]"
          onClick={() => setResetConfirmOpen(true)}
        >
          <RefreshIcon className="h-4 w-4" />
          Reset
        </button>
      </div>

      <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-6 shadow-sm sm:px-6">
        <Section id="appearance" title="Appearance">
          <SettingRow
            title="Night mode"
            description="Choose whether SUSS Planner follows your system appearance, stays light, or stays dark."
          >
            <SegmentedControl
              label="Night mode"
              value={settings.colorScheme}
              options={[
                { value: "system", label: "Auto" },
                { value: "dark", label: "On" },
                { value: "light", label: "Off" },
              ]}
              onChange={(colorScheme) => updateSettings({ colorScheme })}
            />
          </SettingRow>
        </Section>

        <Section id="theme" title="Theme">
          <p className="max-w-2xl text-[14px] leading-6 text-[var(--on-surface-variant)]">
            Pick the timetable color palette. The preview reflects the selected palette and the
            timetable defaults below.
          </p>
          <TimetablePreview settings={settings} theme={selectedTheme} />
          <ThemePicker
            selectedThemeId={settings.themeId}
            onSelectTheme={(themeId) => updateSettings({ themeId })}
          />
        </Section>

        <Section id="timetable" title="Timetable">
          <SettingRow
            title="Timetable orientation"
            description="Choose the default timetable layout for desktop and print exports."
          >
            <SegmentedControl
              label="Timetable orientation"
              value={settings.timetableOrientation}
              options={[
                { value: "horizontal", label: "Horizontal" },
                { value: "vertical", label: "Vertical" },
              ]}
              onChange={(timetableOrientation) => updateSettings({ timetableOrientation })}
            />
          </SettingRow>

        </Section>

        <Section id="reminders" title="Course Registration Reminders">
          <SettingRow
            title="Reminder notifications"
            description="You can get a reminder about when eCR / add-drop periods start with a small notification."
          >
            <SegmentedControl
              label="Reminder notifications"
              value={settings.registrationReminders ? "on" : "off"}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              onChange={(value) => updateSettings({ registrationReminders: value === "on" })}
            />
          </SettingRow>
        </Section>
      </div>

      <span className="sr-only">Current color scheme preference: {settings.colorScheme}</span>

      <Modal
        open={resetConfirmOpen}
        title="Reset Settings?"
        description="This will restore every setting on this page to its default value."
        onClose={() => setResetConfirmOpen(false)}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="rounded-[0.7rem] border border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={resetSettings}
              className="rounded-[0.7rem] bg-red-500 px-3 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-red-400"
            >
              Reset Settings
            </button>
          </>
        )}
      >
        <p className="text-[13px] leading-6 text-[var(--on-surface-variant)]">
          You can&apos;t undo this reset. Your saved preferences on this device will be replaced with the defaults.
        </p>
      </Modal>
    </main>
  );
}
