"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  CalendarWeekIcon,
  ColumnsIcon,
  RefreshIcon,
  RowsIcon,
  SettingsIcon,
  SunIcon,
} from "@/components/planner/icons";
import { COURSE_COLOR_PALETTE } from "@/lib/timetable/timetable-utils";

type ColorSchemePreference = "system" | "light" | "dark";
type TimetableOrientation = "horizontal" | "vertical";
type PrerequisiteTreeDirection = "left" | "right";

type SettingsState = {
  colorScheme: ColorSchemePreference;
  themeId: string;
  timetableOrientation: TimetableOrientation;
  showCourseTitles: boolean;
  prerequisiteTreeDirection: PrerequisiteTreeDirection;
  registrationReminders: boolean;
  registrationStudentType: "Undergraduate" | "Graduate";
  allowAnonymousAnalytics: boolean;
  betaFeatures: boolean;
};

type ThemeOption = {
  id: string;
  name: string;
  colors: readonly string[];
};

const STORAGE_KEY = "sussplanner:settings";

const DEFAULT_SETTINGS: SettingsState = {
  colorScheme: "system",
  themeId: "current-timetable",
  timetableOrientation: "horizontal",
  showCourseTitles: true,
  prerequisiteTreeDirection: "right",
  registrationReminders: true,
  registrationStudentType: "Undergraduate",
  allowAnonymousAnalytics: true,
  betaFeatures: false,
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "current-timetable",
    name: "Current Timetable",
    colors: COURSE_COLOR_PALETTE,
  },
  {
    id: "suss-brand",
    name: "SUSS Brand",
    colors: ["#001E60", "#DA291C", "#9ADBE8", "#D0DF00", "#7B87B8", "#F08A81", "#D6D2C4", "#B8E9F1"],
  },
  {
    id: "focus",
    name: "Focus",
    colors: ["#172554", "#1D4ED8", "#2563EB", "#0891B2", "#475569", "#64748B", "#94A3B8", "#CBD5E1"],
  },
  {
    id: "bright",
    name: "Bright",
    colors: ["#164E63", "#0D9488", "#84CC16", "#FACC15", "#F97316", "#E11D48", "#9333EA", "#2563EB"],
  },
];

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

function readSettings()
{
  try
  {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored)
    {
      return DEFAULT_SETTINGS;
    }

    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(stored),
    } as SettingsState;
  }
  catch
  {
    return DEFAULT_SETTINGS;
  }
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

function SwitchControl({
  checked,
  onChange,
  labels = ["On", "Off"],
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labels?: [string, string];
})
{
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-w-[8.5rem] items-center justify-between gap-2 rounded-md border px-1.5 py-1.5 text-[13px] font-bold transition ${
        checked
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
          : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)]"
      }`}
    >
      <span className={`rounded px-2 py-1 ${checked ? "bg-white/16" : "bg-[var(--surface-container-high)]"}`}>
        {checked ? labels[0] : labels[1]}
      </span>
      <span
        className={`h-5 w-10 rounded-full p-0.5 transition ${
          checked ? "bg-white/28" : "bg-[var(--outline-variant)]"
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
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
      {THEME_OPTIONS.map((theme) => {
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
              {settings.showCourseTitles ? (
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
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSettings(readSettings());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready)
    {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [ready, settings]);

  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((theme) => theme.id === settings.themeId) ?? THEME_OPTIONS[0],
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
    setSettings(DEFAULT_SETTINGS);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-[12px] font-bold text-[var(--primary)]">
            <SettingsIcon className="h-4 w-4" />
            Preferences
          </div>
          <h1 className="mt-4 text-[32px] font-black leading-10 text-[var(--on-surface)]">
            Settings
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[var(--on-surface-variant)]">
            Customise how SUSS Planner looks and behaves on this browser. These controls are saved locally under{" "}
            <code className="rounded bg-[var(--surface-container-low)] px-1.5 py-0.5 text-[12px] font-bold">
              {STORAGE_KEY}
            </code>{" "}
            for now.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-2 text-[13px] font-bold text-[var(--on-surface)] transition hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)]"
          onClick={resetSettings}
        >
          <RefreshIcon className="h-4 w-4" />
          Reset
        </button>
      </div>

      <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-6 shadow-sm sm:px-6">
        <Section id="appearance" title="Appearance">
          <SettingRow
            title="Night mode"
            description="Choose whether the settings surface follows the system, stays light, or stays dark when this is wired into the app shell."
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
            description="Prepare the default timetable layout preference for desktop and print exports."
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

          <SettingRow
            title="Course titles"
            description="Show course titles inside timetable blocks when there is enough space."
          >
            <SwitchControl
              checked={settings.showCourseTitles}
              labels={["Show", "Hide"]}
              onChange={(showCourseTitles) => updateSettings({ showCourseTitles })}
            />
          </SettingRow>

          <SettingRow
            title="Prerequisite tree direction"
            description={`Course prerequisites appear to the ${settings.prerequisiteTreeDirection} of the selected course in the planned course tree.`}
          >
            <SegmentedControl
              label="Prerequisite tree direction"
              value={settings.prerequisiteTreeDirection}
              options={[
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ]}
              onChange={(prerequisiteTreeDirection) => updateSettings({ prerequisiteTreeDirection })}
            />
          </SettingRow>
        </Section>

        <Section id="reminders" title="Registration Reminders">
          <SettingRow
            title="Reminder notifications"
            description="Prepare a global preference for showing registration window reminders in the app."
          >
            <SwitchControl
              checked={settings.registrationReminders}
              onChange={(registrationReminders) => updateSettings({ registrationReminders })}
            />
          </SettingRow>

          {settings.registrationReminders ? (
            <SettingRow
              title="Student type"
              description="Choose which registration schedule should be used once reminders are connected."
            >
              <select
                className="min-w-[13rem] rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] font-bold text-[var(--on-surface)]"
                value={settings.registrationStudentType}
                onChange={(event) =>
                  updateSettings({
                    registrationStudentType: event.target.value as SettingsState["registrationStudentType"],
                  })
                }
              >
                <option>Undergraduate</option>
                <option>Graduate</option>
              </select>
            </SettingRow>
          ) : null}
        </Section>

        <Section id="privacy" title="Privacy">
          <SettingRow
            title="Anonymous analytics"
            description="Prepare an opt-in switch for aggregate product usage data. This page does not send analytics."
          >
            <SwitchControl
              checked={settings.allowAnonymousAnalytics}
              labels={["Allow", "Opt out"]}
              onChange={(allowAnonymousAnalytics) => updateSettings({ allowAnonymousAnalytics })}
            />
          </SettingRow>
        </Section>

        <Section id="beta" title="Beta Features">
          <SettingRow
            title="SUSS Planner beta"
            description="Mark this browser as open to testing new planner features once a beta channel exists."
          >
            <SwitchControl
              checked={settings.betaFeatures}
              labels={["Enabled", "Disabled"]}
              onChange={(betaFeatures) => updateSettings({ betaFeatures })}
            />
          </SettingRow>
        </Section>
      </div>

      <div className="mt-5 grid gap-3 text-[13px] leading-6 text-[var(--on-surface-variant)] sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <SunIcon className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
          <span>Appearance settings are local only.</span>
        </div>
        <div className="flex items-start gap-2">
          <ColumnsIcon className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
          <span>Names match future global settings wiring.</span>
        </div>
        <div className="flex items-start gap-2">
          <RowsIcon className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
          <span>The main navigation is unchanged.</span>
        </div>
      </div>

      <span className="sr-only">Current color scheme preference: {settings.colorScheme}</span>
    </main>
  );
}
