import Link from "next/link";
import type { ReactNode } from "react";

import {
  BookIcon,
  CalendarWeekIcon,
  CodeIcon,
  ShareIcon,
} from "@/components/planner/icons";
import type { PlannerSection } from "@/lib/timetable/types";

const SIDEBAR_WIDTH = 260;

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
  {
    id: "share",
    label: "Share",
    href: "/share",
    icon: ShareIcon,
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
    <main className="min-h-screen bg-[var(--background)] text-[var(--on-surface)]">
      <nav
        className="fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-[var(--outline-variant)] bg-[var(--surface-container-low)] py-8 shadow-lg md:flex"
        style={{ width: `${SIDEBAR_WIDTH}px` }}
      >
        <div className="mb-4 border-b border-[var(--outline-variant)] px-8 py-6">
          <Link href="/planner" className="text-[24px] font-black leading-8 tracking-[-0.01em] text-[var(--primary)]">
            SUSS Planner
          </Link>
          <p className="mt-1 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">{currentWeekLabel}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-r-[0.25rem] border-l-4 px-4 py-3 text-left text-[12px] font-semibold leading-4 transition-all duration-200 ease-in-out ${
                    activeSection === item.id
                      ? "border-[var(--primary-container)] bg-[var(--primary)] text-[var(--on-primary)] shadow-sm hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]"
                      : "border-transparent text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-highest)] hover:text-[var(--primary)]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--outline-variant)] px-4 pt-4">
          <a
            className="flex items-center gap-3 rounded-[0.5rem] px-4 py-3 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)] transition-all duration-200 ease-in-out hover:bg-[var(--surface-container-highest)] hover:text-[var(--primary)]"
            href="https://github.com/Simplificatedd/SUSSplanner"
            target="_blank"
            rel="noreferrer"
          >
            <CodeIcon className="h-5 w-5" />
            Git Repo
          </a>
        </div>
      </nav>

      <section className="min-h-screen bg-[var(--background)] md:ml-[260px]">
        <div className="border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)] px-4 py-4 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href="/planner" className="text-[24px] font-black leading-[30px] tracking-[-0.01em] text-[var(--primary)]">
                SUSS Planner
              </Link>
              <p className="mt-1 text-[12px] font-semibold leading-4 text-[var(--on-surface-variant)]">{currentWeekLabel}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`rounded-[0.25rem] border px-3 py-2 text-center text-[12px] font-semibold leading-4 ${
                  activeSection === item.id
                    ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]"
                    : "border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-[var(--on-surface-variant)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {children}
      </section>
    </main>
  );
}
