import Link from "next/link";
import type { ReactNode } from "react";

import {
  BookIcon,
  CalendarWeekIcon,
  CodeIcon,
  LayersIcon,
} from "@/components/planner/icons";
import type { PlannerSection } from "@/lib/timetable/types";

const navItems = [
  {
    id: "planner",
    label: "Timetable",
    href: "/planner",
    icon: CalendarWeekIcon,
  },
  {
    id: "courses",
    label: "Courses",
    href: "/courses",
    icon: BookIcon,
  },
] as const satisfies Array<{
  id: PlannerSection;
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactNode;
}>;

export function AppShell({
  activeSection,
  currentWeekLabel,
  children,
}: {
  activeSection: PlannerSection;
  currentWeekLabel: string;
  children: ReactNode;
})
{
  return (
    <main className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--on-surface)]">
      <header className="sticky top-0 z-40 border-b border-[var(--outline-variant)] bg-[color:rgb(249_249_255_/_0.92)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3">
              <Link href="/planner" className="text-[24px] font-extrabold leading-8 tracking-[-0.02em] text-[var(--primary-container)]">
                SUSS Planner
              </Link>

              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`inline-flex items-center gap-2 rounded-[999px] px-3 py-2 text-[12px] font-semibold leading-4 transition-colors ${
                        activeSection === item.id
                          ? "bg-[var(--primary)] !text-[var(--on-primary)] hover:bg-[var(--primary-container)] hover:!text-[var(--on-primary)]"
                          : "text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  );
                })}
                <span
                  aria-disabled="true"
                  className="inline-flex items-center gap-2 rounded-[999px] border border-dashed border-[var(--outline-variant)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)] opacity-70"
                >
                  <LayersIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Planner</span>
                </span>
              </nav>
            </div>

            <div className="flex justify-start xl:justify-end">
              <div className="px-1 py-1 text-[14px] font-semibold leading-5 text-[var(--on-surface-variant)]">
                {currentWeekLabel}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>

        <footer className="border-t border-[var(--outline-variant)] bg-[var(--surface-container-low)]">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[13px] font-semibold leading-5 text-[var(--on-surface)]">SUSS Planner</p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--on-surface-variant)]">
                For students by students. Visit the Git Repo to report issues.
              </p>
            </div>

            <a
              className="inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[12px] font-semibold leading-4 text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              href="https://github.com/Simplificatedd/SUSSplanner"
              target="_blank"
              rel="noreferrer"
            >
              <CodeIcon className="h-4 w-4" />
              Git Repo
            </a>
          </div>
        </footer>
      </section>
    </main>
  );
}
