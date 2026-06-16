import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import {
  ArrowUpRightIcon,
  BookIcon,
  CalculatorIcon,
  CalendarWeekIcon,
  LayersIcon,
} from "@/components/planner/icons";

export const metadata: Metadata = {
  title: "Home | SUSS Planner",
  description: "Start page for SUSS timetable, course, study-plan, GPA, and school portal shortcuts.",
};

const projectAreas = [
  {
    title: "Timetable",
    eyebrow: "Semester schedule",
    description: "Build class combinations, switch groups, inspect weekly lessons, and catch clashes before they become admin problems.",
    href: "/timetable",
    icon: CalendarWeekIcon,
    accentBg: "bg-[var(--primary)]",
    accentText: "text-on-primary",
  },
  {
    title: "Courses",
    eyebrow: "Catalog search",
    description: "Search course details, assessments, offered semesters, and available class groups before adding modules to a plan.",
    href: "/courses",
    icon: BookIcon,
    accentBg: "bg-[var(--accent)]",
    accentText: "text-white",
  },
  {
    title: "Planner",
    eyebrow: "Degree map",
    description: "Arrange modules across semesters, track credit units, and keep a browser-local study plan with backup support.",
    href: "/planner",
    icon: LayersIcon,
    accentBg: "bg-[#143d8f]",
    accentText: "text-white",
  },
  {
    title: "Calculator",
    eyebrow: "GPA estimate",
    description: "Estimate current and cumulative GPA, add catalog or custom modules, and compare Pass/Fail strategies.",
    href: "/calculator",
    icon: CalculatorIcon,
    accentBg: "bg-[#203047]",
    accentText: "text-white",
  },
] as const;

const portalLinks = [
  "Student Portal",
  "Canvas / LMS",
  "eServices",
  "Academic Calendar",
  "Exam Timetable",
  "Library",
  "Student Support",
  "Fees & Payments",
] as const;

export default function HomePage()
{
  return (
    <AppShell activeSection="home" currentWeekLabel="Start here">
      <div className="relative isolate overflow-hidden bg-[var(--surface-container-lowest)]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-[rgb(var(--suss-blue-rgb)/0.13)] blur-3xl" />
          <div className="absolute right-[-7rem] top-16 h-72 w-72 rounded-full bg-[rgb(var(--suss-red-rgb)/0.10)] blur-3xl" />
          <div className="absolute bottom-[-10rem] left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--surface-container-high),transparent_35%)] blur-3xl" />
        </div>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:px-8 lg:py-14">
          <div className="flex min-w-0 flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--primary)] shadow-sm">
              Academic planning hub
            </div>

            <h1 className="mt-5 max-w-4xl text-[clamp(2.4rem,8vw,5.8rem)] font-black leading-[0.88] tracking-[-0.07em] text-[var(--on-surface)]">
              Plan school without hunting through tabs.
            </h1>

            <p className="mt-6 max-w-2xl text-[16px] leading-7 text-[var(--on-surface-variant)] sm:text-[18px] sm:leading-8">
              Jump into the timetable, course catalog, semester planner, GPA calculator, or the school portal shortcuts from one responsive start page.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                prefetch
                href="/timetable"
                className="inline-flex items-center justify-center gap-2 rounded-[0.85rem] bg-[var(--primary)] px-5 py-3 text-[14px] font-bold text-on-primary shadow-[0_14px_28px_rgb(var(--suss-blue-rgb)/0.22)] transition hover:bg-[var(--primary-container)] hover:text-on-primary"
              >
                Open Timetable
                <ArrowUpRightIcon className="h-4 w-4" />
              </Link>
              <a
                href="#portal-links"
                className="inline-flex items-center justify-center rounded-[0.85rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-5 py-3 text-[14px] font-bold text-[var(--on-surface)] shadow-sm transition hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-low)] hover:text-[var(--primary)]"
              >
                Portal shortcuts
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.4rem] border border-[var(--brand-divider)] bg-[linear-gradient(135deg,var(--primary),#193a86)] p-5 text-white shadow-[0_18px_44px_rgb(var(--suss-blue-rgb)/0.22)] sm:col-span-2 lg:col-span-1">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/75">Quick start</p>
              <p className="mt-3 text-[24px] font-black leading-8 tracking-[-0.03em]">Pick a semester, add modules, then share or export.</p>
              <p className="mt-4 text-[14px] leading-6 text-white/78">
                Timetable and planner data stays in this browser. Use backups or share links when moving plans around.
              </p>
            </div>

            <div className="rounded-[1.2rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <p className="text-[13px] font-bold text-[var(--on-surface)]">Browser local</p>
              <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)]">No account required. Timetable, study plan, and GPA entries are saved locally.</p>
            </div>

            <div className="rounded-[1.2rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm">
              <p className="text-[13px] font-bold text-[var(--on-surface)]">Data-backed</p>
              <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)]">Course, class, assessment, and semester data are read from the academic database.</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {projectAreas.map((area) => {
              const Icon = area.icon;

              return (
                <Link
                  key={area.href}
                  prefetch
                  href={area.href}
                  className="group flex min-h-[17rem] flex-col rounded-[1.25rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--brand-divider)] hover:shadow-[var(--shadow-elev-2)]"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-[1rem] ${area.accentBg} ${area.accentText}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">{area.eyebrow}</p>
                  <h2 className="mt-2 text-[24px] font-black leading-7 tracking-[-0.04em] text-[var(--on-surface)]">{area.title}</h2>
                  <p className="mt-3 flex-1 text-[14px] leading-6 text-[var(--on-surface-variant)]">{area.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--primary)]">
                    Open area
                    <ArrowUpRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="portal-links" className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <div className="rounded-[1.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-low)] p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">School portal shortcuts</p>
                <h2 className="mt-2 text-[28px] font-black leading-8 tracking-[-0.04em] text-[var(--on-surface)]">Common links, ready for real URLs.</h2>
              </div>
              <p className="max-w-md text-[13px] leading-5 text-[var(--on-surface-variant)]">
                These are placeholders for now. Replace each target when the official portal URLs are confirmed.
              </p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {portalLinks.map((label) => (
                <a
                  key={label}
                  href="#portal-links"
                  className="group flex items-center justify-between gap-3 rounded-[0.9rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-[14px] font-bold text-[var(--on-surface)] transition hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
                >
                  <span>{label}</span>
                  <span className="rounded-full bg-[var(--brand-chip-bg)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--primary)]">
                    TBD
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
