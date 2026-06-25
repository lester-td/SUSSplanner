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
    dayIndex: 0,
    timeIndex: 0,
    course: "ICT239",
    title: "Web Application Development",
    colorIndex: 0,
  },
  {
    dayIndex: 1,
    timeIndex: 2,
    course: "MTH212",
    title: "Statistical Analysis",
    colorIndex: 1,
  },
  {
    dayIndex: 2,
    timeIndex: 3,
    course: "BUS105",
    title: "Statistics",
    colorIndex: 2,
  },
  {
    dayIndex: 3,
    timeIndex: 1,
    course: "FIN306",
    title: "Financial Markets",
    colorIndex: 3,
  },
  {
    dayIndex: 0,
    timeIndex: 2,
    course: "PSY107",
    title: "Introduction to Psychology 1",
    colorIndex: 4,
  },
  {
    dayIndex: 2,
    timeIndex: 1,
    course: "ANL201",
    title: "Data Visualisation for Business",
    colorIndex: 6,
  },
  {
    dayIndex: 3,
    timeIndex: 3,
    course: "SWK356",
    title: "Social Work in Healthcare",
    colorIndex: 7,
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
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const times = ["08:30", "12:00", "15:30", "19:00"];
  const gridTemplateColumns = isVertical
    ? `4.5rem repeat(${days.length}, minmax(8rem, 1fr))`
    : `4.5rem repeat(${times.length}, minmax(7rem, 1fr))`;
  const gridTemplateRows = isVertical
    ? `3rem repeat(${times.length}, 4.5rem)`
    : `3rem repeat(${days.length}, 5.25rem)`;

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

      <div className="overflow-x-auto p-3">
        <div
          className="grid min-w-[46rem] gap-1 text-[11px] leading-4"
          style={{ gridTemplateColumns, gridTemplateRows }}
        >
          <div className="rounded bg-[var(--surface-container-low)]" style={{ gridColumn: 1, gridRow: 1 }} />

          {isVertical ? days.map((day, dayIndex) => (
            <div
              key={day}
              className="flex items-center rounded bg-[var(--surface-container-low)] px-2 font-bold text-[var(--on-surface-variant)]"
              style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
            >
              {day}
            </div>
          )) : times.map((time, timeIndex) => (
            <div
              key={time}
              className="flex items-center rounded bg-[var(--surface-container-low)] px-2 font-semibold text-[var(--on-surface-variant)]"
              style={{ gridColumn: timeIndex + 2, gridRow: 1 }}
            >
              {time}
            </div>
          ))}

          {isVertical ? times.map((time, timeIndex) => (
            <div
              key={time}
              className="flex items-center rounded bg-[var(--surface-container-low)] px-2 font-semibold text-[var(--on-surface-variant)]"
              style={{ gridColumn: 1, gridRow: timeIndex + 2 }}
            >
              {time}
            </div>
          )) : days.map((day, dayIndex) => (
            <div
              key={day}
              className="flex items-center rounded bg-[var(--surface-container-low)] px-2 font-bold text-[var(--on-surface-variant)]"
              style={{ gridColumn: 1, gridRow: dayIndex + 2 }}
            >
              {day}
            </div>
          ))}

          {days.flatMap((day, dayIndex) => times.map((time, timeIndex) => (
            <div
              key={`${day}-${time}`}
              className="rounded bg-[var(--surface-container-lowest)] ring-1 ring-[var(--outline-variant)]"
              style={{
                gridColumn: isVertical ? dayIndex + 2 : timeIndex + 2,
                gridRow: isVertical ? timeIndex + 2 : dayIndex + 2,
              }}
            />
          )))}

          {PREVIEW_BLOCKS.map((block) => (
            <div
              key={block.course}
              className="timetable-cell z-10"
              style={{
                gridColumn: isVertical ? block.dayIndex + 2 : block.timeIndex + 2,
                gridRow: isVertical ? block.timeIndex + 2 : block.dayIndex + 2,
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
              <span className="timetable-cell__time mt-auto">{times[block.timeIndex]}</span>
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

        <Section id="theme" title="Theme">
          <p className="max-w-2xl text-[14px] leading-6 text-[var(--on-surface-variant)]">
            Pick the timetable color palette. The preview reflects the selected palette and
            timetable orientation.
          </p>
          <TimetablePreview settings={settings} theme={selectedTheme} />
          <ThemePicker
            selectedThemeId={settings.themeId}
            onSelectTheme={(themeId) => updateSettings({ themeId })}
          />
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
              className="app-danger-action rounded-[0.7rem] bg-red-500 px-3 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-red-400"
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
