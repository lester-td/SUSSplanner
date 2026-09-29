"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  BellIcon,
  CalendarWeekIcon,
  PaletteIcon,
  RefreshIcon,
} from "@/components/planner/icons";
import { RegistrationReminderStatusPill } from "@/components/registration/reminder-status-pill";
import { Modal } from "@/components/ui/modal";
import { TimetableCanvas } from "@/components/timetable/timetable-canvas";
import { REGISTRATION_REMINDER_SCHEDULE_DISPLAY_ITEMS } from "@/lib/registration/reminder-schedule-display";
import {
  APP_SETTINGS_STORAGE_KEY,
  APP_SETTINGS_UPDATED_EVENT,
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
import {
  START_MINUTES,
  buildTimeSlots,
  getVisibleEndMinutes,
} from "@/lib/timetable/date-utils";
import type { TimetableBlock } from "@/lib/timetable/types";

const REMINDER_SCHEDULE_POPOVER_GAP = 6;
const REMINDER_SCHEDULE_POPOVER_MARGIN = 16;
const REMINDER_SCHEDULE_POPOVER_MAX_HEIGHT = 320;
const REMINDER_SCHEDULE_POPOVER_MAX_WIDTH = 352;
const REMINDER_SCHEDULE_MOBILE_TABLET_QUERY = "(max-width: 1199px)";

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

function settingsAreEqual(left: SettingsState, right: SettingsState)
{
  return left.colorScheme === right.colorScheme
    && left.themeId === right.themeId
    && left.timetableOrientation === right.timetableOrientation
    && left.registrationReminders.enabled === right.registrationReminders.enabled
    && left.timetableStudyMode === right.timetableStudyMode;
}

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
function Section({
  title,
  id,
  icon,
  children,
}: {
  title: string;
  id: string;
  icon: ReactNode;
  children: ReactNode;
})
{
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="app-aero-panel settings-section min-w-0 overflow-hidden">
      <div className="app-aero-panel-heading">
        {icon}
        <h2 id={`${id}-heading`} className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">{title}</h2>
      </div>
      <div className="space-y-5 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  detail,
  children,
}: {
  title: string;
  description: string;
  detail?: ReactNode;
  children: ReactNode;
})
{
  return (
    <div className="settings-row grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6">
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold leading-6 text-[var(--on-surface)] sm:text-[16px]">{title}</h3>
        <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px] sm:leading-6">{description}</p>
        {detail ? <div className="mt-2">{detail}</div> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center lg:justify-self-end">{children}</div>
    </div>
  );
}

function ReminderSchedulePopover()
{
  const [open, setOpen] = useState(false);
  const [openSource, setOpenSource] = useState<"click" | "hover" | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePopoverId = "registration-reminder-schedule-popover";

  function clearHoverCloseTimeout()
  {
    if (hoverCloseTimeoutRef.current)
    {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }

  function closePopover()
  {
    clearHoverCloseTimeout();
    setOpen(false);
    setOpenSource(null);
  }

  function openPopover(source: "click" | "hover")
  {
    clearHoverCloseTimeout();
    setOpen(true);
    setOpenSource((currentSource) => currentSource === "click" ? currentSource : source);
  }

  function canClickOpenPopover()
  {
    return typeof window !== "undefined" && window.matchMedia(REMINDER_SCHEDULE_MOBILE_TABLET_QUERY).matches;
  }

  function shouldKeepHoverPopoverOpen(relatedTarget: EventTarget | null)
  {
    const nextTarget = relatedTarget instanceof Node ? relatedTarget : null;

    return Boolean(
      nextTarget
      && (triggerRef.current?.contains(nextTarget) || popoverRef.current?.contains(nextTarget)),
    );
  }

  function closeHoverPopover(relatedTarget: EventTarget | null, delayMs = 0)
  {
    if (openSource !== "hover" || shouldKeepHoverPopoverOpen(relatedTarget))
      return;

    clearHoverCloseTimeout();

    if (delayMs <= 0)
    {
      closePopover();
      return;
    }

    hoverCloseTimeoutRef.current = setTimeout(() => {
      closePopover();
    }, delayMs);
  }

  const updatePopoverPosition = () => {
    const triggerElement = triggerRef.current;
    const popoverElement = popoverRef.current;

    if (!triggerElement || !popoverElement)
      return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const usableWidth = Math.max(0, viewportWidth - (REMINDER_SCHEDULE_POPOVER_MARGIN * 2));
    const width = Math.min(REMINDER_SCHEDULE_POPOVER_MAX_WIDTH, usableWidth);
    const contentHeight = popoverElement.scrollHeight;
    const availableBelow = viewportHeight - triggerRect.bottom - REMINDER_SCHEDULE_POPOVER_GAP - REMINDER_SCHEDULE_POPOVER_MARGIN;
    const availableAbove = triggerRect.top - REMINDER_SCHEDULE_POPOVER_GAP - REMINDER_SCHEDULE_POPOVER_MARGIN;
    const openAbove = availableBelow < contentHeight && availableAbove > availableBelow;
    const availableVerticalSpace = Math.max(0, openAbove ? availableAbove : availableBelow);
    const maxHeight = Math.min(
      REMINDER_SCHEDULE_POPOVER_MAX_HEIGHT,
      Math.max(0, viewportHeight - (REMINDER_SCHEDULE_POPOVER_MARGIN * 2)),
      availableVerticalSpace,
    );
    const measuredHeight = Math.min(contentHeight, Math.max(maxHeight, 0));
    const preferredLeft = triggerRect.left;
    const left = Math.min(
      Math.max(REMINDER_SCHEDULE_POPOVER_MARGIN, preferredLeft),
      Math.max(REMINDER_SCHEDULE_POPOVER_MARGIN, viewportWidth - width - REMINDER_SCHEDULE_POPOVER_MARGIN),
    );
    const top = openAbove
      ? triggerRect.top - REMINDER_SCHEDULE_POPOVER_GAP - measuredHeight
      : triggerRect.bottom + REMINDER_SCHEDULE_POPOVER_GAP;

    setPopoverPosition({
      top: Math.max(REMINDER_SCHEDULE_POPOVER_MARGIN, top),
      left,
      width,
      maxHeight,
    });
  };

  useLayoutEffect(() => {
    if (!open)
    {
      setPopoverPosition(null);
      return;
    }

    updatePopoverPosition();
  }, [open]);

  useEffect(() => {
    if (!open)
      return;

    function handlePointerDown(event: PointerEvent)
    {
      const target = event.target as Node;

      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target))
        closePopover();
    }

    function handleKeyDown(event: KeyboardEvent)
    {
      if (event.key === "Escape")
        closePopover();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      clearHoverCloseTimeout();
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !popoverPosition)
      return;

    updatePopoverPosition();
  }, [open, popoverPosition?.width, popoverPosition?.maxHeight]);

  const popover = open ? (
    <div
      id={schedulePopoverId}
      ref={popoverRef}
      role="dialog"
      aria-label="Reminder schedule"
      className="fixed z-50 rounded-md border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-3 text-[12px] leading-5 text-[var(--on-surface-variant)] shadow-lg"
      onMouseEnter={clearHoverCloseTimeout}
      onMouseLeave={(event) => closeHoverPopover(event.relatedTarget)}
      style={{
        top: popoverPosition?.top ?? -9999,
        left: popoverPosition?.left ?? -9999,
        width: popoverPosition?.width ?? REMINDER_SCHEDULE_POPOVER_MAX_WIDTH,
        maxHeight: popoverPosition
          ? `min(${popoverPosition.maxHeight}px, calc(100vh - 2rem))`
          : "min(320px, calc(100vh - 2rem))",
        overflowY: "auto",
        visibility: popoverPosition ? "visible" : "hidden",
      }}
    >
      <p className="text-[13px] font-bold leading-5 text-[var(--on-surface)]">Reminder schedule</p>
      <div className="mt-2 grid gap-2">
        {REGISTRATION_REMINDER_SCHEDULE_DISPLAY_ITEMS.map((item) => (
          <div key={item.phase}>
            <RegistrationReminderStatusPill state={item.phase}>{item.label}</RegistrationReminderStatusPill>
            <p className="mt-1">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex cursor-pointer items-center rounded-md px-0.5 py-1 text-[13px] font-bold leading-5 text-[var(--primary)] underline decoration-[var(--primary)]/45 underline-offset-4 outline-none transition hover:text-[var(--on-surface)] hover:decoration-[var(--on-surface)] focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]"
        aria-expanded={open}
        aria-controls={schedulePopoverId}
        aria-haspopup="dialog"
        onClick={(event) => {
          if (event.detail === 0 || canClickOpenPopover())
            openPopover("click");
        }}
        onMouseEnter={() => openPopover("hover")}
        onMouseLeave={(event) => closeHoverPopover(event.relatedTarget, 80)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open)
          {
            event.preventDefault();
            closePopover();
          }
        }}
      >
        Reminder schedule
      </button>
      {popover ? createPortal(popover, document.body) : null}
    </>
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
      className="inline-flex max-w-full flex-wrap rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-1"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-[0.65rem] px-2.5 py-1.5 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)] sm:px-4 sm:py-2 sm:text-[13px] ${
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
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
      {APP_THEME_OPTIONS.map((theme) => {
        const selected = theme.id === selectedThemeId;

        return (
          <button
            key={theme.id}
            type="button"
            className={`app-aero-shortcut rounded-[0.9rem] border p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)] sm:p-4 ${
              selected ? "border-[var(--primary)] ring-2 ring-[var(--primary-ring-soft)]" : "border-[var(--outline-variant)]"
            }`}
            aria-pressed={selected}
            onClick={() => onSelectTheme(theme.id)}
          >
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <span className="text-[14px] font-bold text-[var(--on-surface)]">{theme.name}</span>
              {selected ? (
                <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
                  Selected
                </span>
              ) : null}
            </div>
            <ul className="mt-3 grid grid-cols-8 gap-1 sm:mt-4 sm:gap-1.5" aria-label={`${theme.name} colors`}>
              {theme.colors.map((color) => (
                <li
                  key={color}
                  className="h-6 rounded border border-b-4 border-black/10 sm:h-8"
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
    <div className="overflow-hidden rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)]">
      <div className="app-aero-panel-heading flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <CalendarWeekIcon className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[13px] font-bold text-[var(--on-surface)]">Preview</span>
        </div>
        <span className="text-[12px] font-semibold text-[var(--on-surface-variant)]">
          {isHorizontal ? "Horizontal" : "Vertical"}
        </span>
      </div>

      <div className="overflow-hidden bg-[var(--surface-container-lowest)] p-1.5 sm:p-3">
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

    const syncSettings = () => {
      const nextSettings = readAppSettings();
      setSettings((currentSettings) => (
        settingsAreEqual(currentSettings, nextSettings)
          ? currentSettings
          : nextSettings
      ));
    };
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_STORAGE_KEY)
      {
        syncSettings();
      }
    };

    window.addEventListener(APP_SETTINGS_UPDATED_EVENT, syncSettings);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, syncSettings);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [ready]);

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
    <div className="settings-page -mx-3 sm:mx-0">
      <div className="grid gap-0 sm:gap-5 lg:gap-6">
        <header className="flex flex-col gap-3 px-3 pb-4 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-0 sm:pb-0 md:pt-8">
          <div>
            <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">
              Settings
            </h1>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:mt-2 sm:text-[15px] sm:leading-7">
              Customise how SUSS Planner looks and behaves on this browser.
            </p>
          </div>
        </header>

        <Section id="timetable" title="Timetable" icon={<CalendarWeekIcon className="h-5 w-5 text-[var(--primary)]" />}>
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

          <SettingRow
            title="Default class type"
            description="Choose whether new timetable entries prefer full-time TG groups or part-time CRN groups."
          >
            <SegmentedControl
              label="Default class type"
              value={settings.timetableStudyMode}
              options={[
                { value: "full-time", label: "Full-time" },
                { value: "part-time", label: "Part-time" },
              ]}
              onChange={(timetableStudyMode) => updateSettings({ timetableStudyMode })}
            />
          </SettingRow>
        </Section>

        <Section id="reminders" title="Reminders" icon={<BellIcon className="h-5 w-5 text-[var(--primary)]" />}>
          <SettingRow
            title="In-app reminders"
            description="Receive in-app reminders for eCR and Add/Drop before each window opens, while it is active, and before it closes."
            detail={<ReminderSchedulePopover />}
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
        </Section>

        <Section id="appearance" title="Appearance" icon={<PaletteIcon className="h-5 w-5 text-[var(--primary)]" />}>
          <SettingRow
            title="Color mode"
            description="Choose a light or dark appearance, or match your device settings."
          >
            <SegmentedControl
              label="Color mode"
              value={settings.colorScheme}
              options={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(colorScheme) => updateSettings({ colorScheme })}
            />
          </SettingRow>
          <div id="theme" className="space-y-4 border-t border-[var(--outline-variant)] pt-5">
            <div>
              <h3 className="text-[15px] font-bold leading-6 text-[var(--on-surface)] sm:text-[16px]">Timetable theme</h3>
              <p className="mt-1 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px] sm:leading-6">
                Pick the timetable color palette. The preview reflects the selected palette and timetable orientation.
              </p>
            </div>
            <TimetablePreview settings={settings} theme={selectedTheme} />
            <ThemePicker
              selectedThemeId={settings.themeId}
              onSelectTheme={(themeId) => updateSettings({ themeId })}
            />
          </div>
        </Section>

        <section id="reset" aria-labelledby="reset-heading" className="app-aero-panel settings-section min-w-0 overflow-hidden">
          <div className="app-aero-panel-heading">
            <RefreshIcon className="h-5 w-5 text-[var(--primary)]" />
            <h2 id="reset-heading" className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">
              Reset settings
            </h2>
          </div>
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-x-6">
            <p className="max-w-2xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px] sm:leading-6">
              Revert your settings to default values.
            </p>
            <button
              type="button"
              className="app-danger-action justify-self-start rounded-[0.8rem] bg-red-500 px-4 py-2 text-[13px] font-semibold leading-5 text-white transition-colors hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 sm:px-5 sm:py-2.5 sm:text-[14px] lg:justify-self-end"
              onClick={() => setResetConfirmOpen(true)}
            >
              Reset
            </button>
          </div>
        </section>
        <span className="sr-only">Current color scheme preference: {settings.colorScheme}</span>
      </div>

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
    </div>
  );
}
