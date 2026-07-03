"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import {
  CalendarWeekIcon,
  RefreshIcon,
} from "@/components/planner/icons";
import { Modal } from "@/components/ui/modal";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import {
  APP_THEME_OPTIONS,
  DEFAULT_APP_SETTINGS,
  announceAppSettingsUpdated,
  getThemeOption,
  normalizeRegistrationReminderPreferences,
  readAppSettings,
  saveAppSettings,
  type RegistrationReminderPreferences,
  type SettingsState,
  type ThemeOption,
} from "@/lib/settings/app-settings";
import { DEFAULT_REGISTRATION_REMINDER_OFFSETS } from "@/lib/registration/reminders";
import {
  START_MINUTES,
  buildTimeSlots,
  getVisibleEndMinutes,
} from "@/lib/timetable/date-utils";
import type { TimetableBlock } from "@/lib/timetable/types";

const PREVIEW_SAMPLE_COURSES = [
  {
    courseCode: "ICT239",
    courseName: "Web Application Development",
    groupCode: "TG01",
    groupCodeType: "TG",
    weekLabel: "1-13",
    venue: "SR 2.1",
  },
  {
    courseCode: "PSY107",
    courseName: "Introduction to Psychology",
    groupCode: "TG02",
    groupCodeType: "TG",
    weekLabel: "1-13",
    venue: "SR 4.3",
  },
  {
    courseCode: "ANL201",
    courseName: "Data Visualisation for Business",
    groupCode: "TG03",
    groupCodeType: "TG",
    weekLabel: "2,4,6,8,10,12",
    venue: "Lab 5.2",
  },
  {
    courseCode: "MTH212",
    courseName: "Statistical Analysis",
    groupCode: "TG04",
    groupCodeType: "TG",
    weekLabel: "1-13",
    venue: "SR 6.1",
  },
  {
    courseCode: "BUS105",
    courseName: "Business Statistics",
    groupCode: "TG05",
    groupCodeType: "TG",
    weekLabel: "1, 3, 5, 7, 9, 11, 13",
    venue: "SR 3.2",
  },
  {
    courseCode: "FIN306",
    courseName: "Financial Markets and Instruments",
    groupCode: "TG06",
    groupCodeType: "TG",
    weekLabel: "1-13",
    venue: "SR 2.8",
  },
  {
    courseCode: "SWK356",
    courseName: "Social Work in Healthcare",
    groupCode: "TG07",
    groupCodeType: "TG",
    weekLabel: "2-12",
    venue: "SR 1.4",
  },
] as const;

const PREVIEW_DAYS = [1, 2, 3, 4, 5] as const;
const PREVIEW_START_TIMES = [8 * 60 + 30, 12 * 60, 15 * 60 + 30] as const;

function hashSeed(value: string)
{
  let hash = 0;
  for (let index = 0; index < value.length; index += 1)
  {
    hash = Math.imul(hash, 31) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash === 0 ? 1 : Math.abs(hash);
}

function createSeededRandom(seed: string)
{
  let state = hashSeed(seed);
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state |= 0;
    return (state >>> 0) / 0x100000000;
  };
}

function shuffleWithSeed<T>(values: readonly T[], seed: string)
{
  const result = [...values];
  const random = createSeededRandom(seed);

  for (let index = result.length - 1; index > 0; index -= 1)
  {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

const PREVIEW_SLOT_ASSIGNMENTS = (() => {
  const assignments = shuffleWithSeed(
    PREVIEW_DAYS.flatMap((dayOfWeek) => PREVIEW_START_TIMES.map((startMinutes) => ({
      dayOfWeek,
      startMinutes,
    }))),
    "settings-preview-v3",
  ).slice(0, PREVIEW_SAMPLE_COURSES.length);

  if (!assignments.some((assignment) => assignment.dayOfWeek === 5))
  {
    assignments[assignments.length - 1] = {
      ...assignments[assignments.length - 1],
      dayOfWeek: 5,
    };
  }

  const swkIndex = PREVIEW_SAMPLE_COURSES.findIndex((course) => course.courseCode === "SWK356");
  if (swkIndex >= 0)
  {
    assignments[swkIndex] = {
      ...assignments[swkIndex],
      startMinutes: PREVIEW_START_TIMES[0],
    };
  }

  return assignments;
})();

const PREVIEW_TIMETABLE_BLOCKS = PREVIEW_SAMPLE_COURSES.map((course, index) => {
  const slot = PREVIEW_SLOT_ASSIGNMENTS[index];

  return {
    id: `preview-${course.courseCode.toLowerCase()}`,
    shareKey: `preview-${course.courseCode.toLowerCase()}`,
    courseCode: course.courseCode,
    courseName: course.courseName,
    groupCode: course.groupCode,
    groupCodeType: course.groupCodeType,
    dayOfWeek: slot.dayOfWeek,
    startMinutes: slot.startMinutes,
    endMinutes: slot.startMinutes + 180,
    weekLabel: course.weekLabel,
    venue: course.venue,
    eventMode: null,
    occurrenceCount: 1,
    eventIds: [index + 1],
  } satisfies TimetableBlock;
});

const PREVIEW_VISIBLE_END_MINUTES = getVisibleEndMinutes(
  PREVIEW_TIMETABLE_BLOCKS.reduce(
    (latestEndMinutes, block) => Math.max(latestEndMinutes, block.endMinutes),
    START_MINUTES,
  ),
);

const PREVIEW_TIME_SLOTS = buildTimeSlots(PREVIEW_VISIBLE_END_MINUTES);
const REMINDER_OFFSET_OPTIONS = DEFAULT_REGISTRATION_REMINDER_OFFSETS.map((offset) => ({
  value: offset.offsetMinutes,
  label: offset.label,
}));

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

function CheckboxButtonGroup<T extends string | number>({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: readonly T[];
  options: Array<{ value: T; label: string }>;
  onChange: (values: T[]) => void;
})
{
  return (
    <div
      className="flex flex-wrap justify-start gap-2 md:justify-end"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = values.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-md border px-3 py-2 text-[13px] font-bold leading-4 transition ${
              selected
                ? "border-[var(--primary)] bg-[var(--primary-container)] text-[var(--on-primary-container)]"
                : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)] hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)]"
            }`}
            aria-pressed={selected}
            onClick={() => {
              onChange(
                selected
                  ? values.filter((value) => value !== option.value)
                  : [...values, option.value],
              );
            }}
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
  const isHorizontal = settings.timetableOrientation === "horizontal";
  const blockColorByKey = useMemo(
    () => new Map(
      PREVIEW_TIMETABLE_BLOCKS.map((block, index) => [
        block.shareKey,
        theme.colors[index % theme.colors.length],
      ]),
    ),
    [theme.colors],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--outline-variant)] px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarWeekIcon className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[13px] font-bold text-[var(--on-surface)]">Timetable preview</span>
        </div>
        <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
          {isHorizontal ? "Horizontal" : "Vertical"}
        </span>
      </div>

      <div className="overflow-hidden bg-[var(--surface-container-lowest)] p-2 sm:p-3">
        <div className="origin-top-left" style={{ zoom: 0.88 } as CSSProperties}>
          <TimetableCanvas
            blocks={PREVIEW_TIMETABLE_BLOCKS}
            blockColorByKey={blockColorByKey}
            isHorizontal={isHorizontal}
            timeSlots={PREVIEW_TIME_SLOTS}
            visibleEndMinutes={PREVIEW_VISIBLE_END_MINUTES}
            showAllWeeks={true}
            dayDateByDay={{}}
            activeShareKey={null}
            deEmphasisMode="none"
            activeCourseCode={null}
            courseCanPickByCode={{}}
            isPickMode={false}
            suppressActiveOutline
            onBlockClick={() => undefined}
            showCurrentTime={false}
          />
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

  function updateRegistrationReminderPreferences(nextPreferences: Partial<RegistrationReminderPreferences>)
  {
    updateSettings({
      registrationReminders: normalizeRegistrationReminderPreferences({
        ...settings.registrationReminders,
        ...nextPreferences,
      }),
    });
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
            title="In-app reminders"
            description="Show reminders in SUSS Planner when eCR / add-drop periods are approaching."
          >
            <SegmentedControl
              label="In-app reminders"
              value={settings.registrationReminders.enabled ? "on" : "off"}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              onChange={(value) => updateRegistrationReminderPreferences({ enabled: value === "on" })}
            />
          </SettingRow>

          <SettingRow
            title="Reminder timing"
            description="Choose when reminders should appear before registration opens."
          >
            <CheckboxButtonGroup
              label="Reminder timing"
              values={settings.registrationReminders.offsetMinutes}
              options={REMINDER_OFFSET_OPTIONS}
              onChange={(offsetMinutes) => updateRegistrationReminderPreferences({ offsetMinutes })}
            />
          </SettingRow>

          <SettingRow
            title="Reminder notification"
            description="Show the top-right notification for active registration reminders."
          >
            <SegmentedControl
              label="Reminder notification"
              value={settings.registrationReminders.inAppBannerEnabled ? "on" : "off"}
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              onChange={(value) => updateRegistrationReminderPreferences({ inAppBannerEnabled: value === "on" })}
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
