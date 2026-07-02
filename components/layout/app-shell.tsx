"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import {
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  CodeIcon,
  LayersIcon,
  SettingsIcon,
} from "@/components/planner/icons";
import {
  formatCurrentWeekChipForMobile,
  getCurrentWeekChip,
  type CurrentSemesterContext,
} from "@/lib/timetable/date-utils";
import type { PlannerSection } from "@/lib/timetable/types";

type AppSection = "home" | PlannerSection | "calculator" | "settings";
type AppShellContentLayout = "framed" | "full-bleed";

const navItems = [
  {
    id: "planner",
    label: "Timetable",
    href: "/timetable",
    icon: CalendarWeekIcon,
  },
  {
    id: "courses",
    label: "Courses",
    href: "/courses",
    icon: BookIcon,
  },
  {
    id: "semester-planner",
    label: "Planner",
    href: "/planner",
    icon: LayersIcon,
  },
  {
    id: "calculator",
    label: "Calculators",
    href: "/calculators",
    icon: CalculatorIcon,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: SettingsIcon,
  },
] as const satisfies Array<{
  id: AppSection;
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactNode;
}>;

type NavItem = typeof navItems[number];

export function AppShell({
  activeSection,
  currentSemesterContext,
  children,
  showHeader = true,
  showNav = true,
  showFooter = true,
  contentLayout = "framed",
  contentFrameClassName = "",
  contentContainerClassName = "",
}: {
  activeSection: AppSection | null;
  currentSemesterContext?: CurrentSemesterContext | null;
  children: ReactNode;
  showHeader?: boolean;
  showNav?: boolean;
  showFooter?: boolean;
  contentLayout?: AppShellContentLayout;
  contentFrameClassName?: string;
  contentContainerClassName?: string;
})
{
  const [isMobileHeaderCollapsed, setIsMobileHeaderCollapsed] = useState(false);

  const currentWeekLabel = getCurrentWeekChip(
    currentSemesterContext?.semester ?? null,
    currentSemesterContext?.week ?? null,
    currentSemesterContext?.isVacation ?? false,
  );
  const currentWeekLabelMobile = formatCurrentWeekChipForMobile(currentWeekLabel);

  useEffect(() => {
    if (!showHeader || !showNav)
    {
      setIsMobileHeaderCollapsed(false);
      return;
    }

    const mobileQuery = window.matchMedia("(max-width: 1199px)");
    let animationFrameId = 0;

    const syncMobileHeaderState = () => {
      const nextCollapsed = mobileQuery.matches && window.scrollY > 12;
      setIsMobileHeaderCollapsed((current) => (current === nextCollapsed ? current : nextCollapsed));
    };

    const scheduleSync = () => {
      if (animationFrameId !== 0)
      {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0;
        syncMobileHeaderState();
      });
    };

    syncMobileHeaderState();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    mobileQuery.addEventListener("change", scheduleSync);

    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      mobileQuery.removeEventListener("change", scheduleSync);

      if (animationFrameId !== 0)
      {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [showHeader, showNav]);

  function renderNavItem(item: NavItem, variant: "desktop" | "mobile")
  {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const isMobileVariant = variant === "mobile";
    const baseClassName = isMobileVariant
      ? "app-nav-link inline-flex min-w-0 items-center justify-center whitespace-nowrap rounded-[1rem] px-2 py-2.5 text-[12px] font-semibold leading-4 transition-colors"
      : "app-nav-link inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[999px] px-2.5 py-1.5 text-[12px] font-semibold leading-4 transition-colors sm:gap-2 sm:px-3 sm:py-2";
    const stateClassName = isActive
      ? "app-nav-link--active bg-[var(--header-chip-active-bg)] !text-[var(--header-chip-active-text)] hover:bg-[var(--header-chip-active-bg)] hover:!text-[var(--header-chip-active-text)]"
      : "text-[var(--header-text-muted)] hover:bg-[var(--header-chip-bg)] hover:text-[var(--header-text)]";

    return (
      <Link
        key={`${variant}-${item.id}`}
        prefetch
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-label={isMobileVariant ? item.label : undefined}
        className={`${baseClassName} ${stateClassName}`}
      >
        <Icon className="app-nav-icon h-4 w-4 shrink-0" />
        <span className="app-nav-label">{item.label}</span>
      </Link>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-[var(--surface-container)] text-[var(--on-surface)]">
      {showHeader ? (
        <header
          className="app-navbar sticky top-0 z-40 border-b border-[color:var(--header-divider)] bg-[var(--header-surface)] shadow-[0_4px_18px_rgba(15,23,42,0.08)] backdrop-blur"
          data-has-nav={showNav ? "true" : "false"}
          data-mobile-collapsed={showNav && isMobileHeaderCollapsed ? "true" : "false"}
        >
          <div className="app-navbar__inner px-3 py-2.5 md:px-[16px] md:py-3">
            <div className="app-navbar__desktop mx-auto hidden max-w-7xl items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5 xl:gap-3">
                <Link prefetch href="/" aria-label="SUSS Planner home" className="hidden shrink-0 lg:inline-flex">
                  <span className="relative block h-7 w-[190px] sm:h-8 sm:w-[220px]">
                    <Image
                      src="/suss_planner_full_white.png"
                      alt="SUSS Planner"
                      fill
                      priority
                      sizes="(min-width: 640px) 220px, 190px"
                      className="object-contain"
                    />
                  </span>
                </Link>

                {showNav ? (
                  <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 sm:gap-1.5 md:gap-2" aria-label="Primary">
                    {navItems.map((item) => renderNavItem(item, "desktop"))}
                  </nav>
                ) : null}
              </div>

              <div className="shrink-0">
                <div className="app-navbar-context whitespace-nowrap px-1 py-1 text-[11px] font-semibold leading-4 text-[var(--header-text-muted)] sm:text-[14px] sm:leading-5">
                  {currentWeekLabel}
                </div>
              </div>
            </div>

            <div className="app-navbar__mobile mx-auto hidden max-w-7xl">
              <div className="app-navbar__mobile-top" aria-hidden={showNav && isMobileHeaderCollapsed ? true : undefined}>
                <Link
                  prefetch
                  href="/"
                  aria-label="SUSS Planner home"
                  tabIndex={showNav && isMobileHeaderCollapsed ? -1 : undefined}
                  className="app-navbar__mobile-brand inline-flex shrink-0"
                >
                  <span className="app-navbar__mobile-logo relative block h-7 w-[170px] sm:h-8 sm:w-[210px]">
                    <Image
                      src="/suss_planner_full_white.png"
                      alt="SUSS Planner"
                      fill
                      priority
                      sizes="(min-width: 640px) 210px, 170px"
                      className="object-contain"
                    />
                  </span>
                </Link>

                <div className="app-navbar__mobile-context app-navbar-context min-w-0 flex-1 truncate whitespace-nowrap px-1 py-1 text-right text-[11px] font-semibold leading-4 text-[var(--header-text-muted)] sm:text-[13px] sm:leading-5">
                  {currentWeekLabelMobile}
                </div>
              </div>

              {showNav ? (
                <nav className="app-navbar__mobile-nav" aria-label="Primary">
                  {navItems.map((item) => renderNavItem(item, "mobile"))}
                </nav>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      <section
        className={`app-content-surface flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)] ${activeSection === "planner" && contentLayout === "full-bleed" ? "app-content-surface--planner-full-bleed" : ""}`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {contentLayout === "framed" ? (
            <div className={`px-3 pb-3 pt-3 md:px-[16px] md:pt-8 ${contentFrameClassName}`.trim()}>
              <div className={`mx-auto w-full max-w-7xl ${contentContainerClassName}`.trim()}>
                {children}
              </div>
            </div>
          ) : (
            children
          )}
        </div>

        {showFooter ? (
          <footer className="border-t border-[var(--brand-divider)] bg-[var(--footer-surface)]">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[13px] font-semibold leading-5 text-[var(--on-surface)]">
                  SUSS Planner
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                  For students by students. Visit the Git Repo to report issues.
                </p>
              </div>

              <a
                className="inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                href="https://github.com/Simplificatedd/SUSSplanner"
                target="_blank"
                rel="noreferrer"
              >
                <CodeIcon className="h-4 w-4" />
                Git Repo
              </a>
            </div>
          </footer>
        ) : null}
      </section>
    </main>
  );
}
