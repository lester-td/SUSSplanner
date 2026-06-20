import Link from "next/link";
import type { ReactNode } from "react";

import {
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  CodeIcon,
  HomeIcon,
  LayersIcon,
} from "@/components/planner/icons";
import type { PlannerSection } from "@/lib/timetable/types";

type AppSection = "home" | PlannerSection | "calculator";

const navItems = [
  {
    id: "home",
    label: "Home",
    href: "/",
    icon: HomeIcon,
  },
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
] as const satisfies Array<{
  id: AppSection;
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactNode;
}>;

export function AppShell({
  activeSection,
  currentWeekLabel,
  children,
  showHeader = true,
  showNav = true,
  showFooter = true,
}: {
  activeSection: AppSection | null;
  currentWeekLabel: string;
  children: ReactNode;
  showHeader?: boolean;
  showNav?: boolean;
  showFooter?: boolean;
})
{
  return (
    <main className="flex min-h-screen flex-col bg-[var(--surface-container)] text-[var(--on-surface)]">
      {showHeader ? (
        <header className="sticky top-0 z-40 border-b border-[color:var(--header-divider)] bg-[var(--header-surface)] shadow-[0_4px_18px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="px-3 py-2.5 md:px-[16px] md:py-3">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5 xl:gap-3">
                <Link prefetch href="/" className="hidden shrink-0 text-[18px] font-extrabold leading-6 tracking-[-0.02em] text-[var(--header-text)] lg:inline sm:text-[24px] sm:leading-8">
                  SUSS Planner
                </Link>

                {showNav ? (
                  <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 sm:gap-1.5 md:gap-2">
                    {navItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.id}
                          prefetch
                          href={item.href}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[999px] px-2.5 py-1.5 text-[12px] font-semibold leading-4 transition-colors sm:gap-2 sm:px-3 sm:py-2 ${
                            activeSection === item.id
                              ? "bg-[var(--header-chip-active-bg)] !text-[var(--header-chip-active-text)] hover:bg-[var(--header-chip-active-bg)] hover:!text-[var(--header-chip-active-text)]"
                              : "text-[var(--header-text-muted)] hover:bg-[var(--header-chip-bg)] hover:text-[var(--header-text)]"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="hidden md:inline">{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                ) : null}
              </div>

              <div className="shrink-0">
                <div className="whitespace-nowrap px-1 py-1 text-[11px] font-semibold leading-4 text-[var(--header-text-muted)] sm:text-[14px] sm:leading-5">
                  {currentWeekLabel}
                </div>
              </div>
            </div>
          </div>
        </header>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col bg-[var(--surface-container-lowest)]">
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
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
