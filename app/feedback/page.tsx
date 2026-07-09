import type { Metadata } from "next";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { AppShell } from "@/components/layout/app-shell";
import { ArrowUpRightIcon } from "@/components/planner/icons";
import { getLatestDataUpdatedAt, getSemestersWithWeeks } from "@/lib/db/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Feedback | SUSS Planner",
  description: "Send feedback, report bugs, or flag incorrect SUSS Planner course data.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FeedbackPage()
{
  const [semesterTree, latestDataUpdatedAt] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
  ]);
  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  return (
    <AppShell
      activeSection="feedback"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
    >
      <div className="feedback-page w-full">
        <div className="mb-5 flex flex-col gap-1.5 sm:mb-6 sm:gap-2">
          <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">
            Feedback
          </h1>
          <p className="max-w-3xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[15px] sm:leading-7">
            Help improve SUSS Planner by opening a public GitHub issue or sending a private feedback form to the maintainers.
          </p>
        </div>

        <div className="grid w-full gap-5 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
          <aside className="grid gap-4">
            <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
              <h2 className="text-[16px] font-bold leading-6 text-[var(--on-surface)]">Useful details</h2>
              <ul className="mt-3 grid gap-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                <li>Course code or class group</li>
                <li>Semester and schedule type</li>
                <li>What you expected to see</li>
                <li>What happened instead</li>
              </ul>
            </section>

            <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-low)] p-4">
              <h2 className="text-[16px] font-bold leading-6 text-[var(--on-surface)]">Public issues</h2>
              <p className="mt-2 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                For bugs and feature requests that others can follow, open an issue on GitHub.
              </p>
              <a
                href="https://github.com/Simplificatedd/SUSSplanner/issues"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-3 py-2 text-[13px] font-bold leading-5 text-[var(--on-surface)] transition-colors hover:border-[var(--brand-divider)] hover:bg-[var(--surface-container-high)] hover:text-[var(--primary)]"
              >
                GitHub Issues
                <ArrowUpRightIcon className="h-4 w-4" />
              </a>
            </section>
          </aside>

          <section className="rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4 shadow-[var(--shadow-elev-1)] sm:p-6">
            <div className="mb-5">
              <h2 className="text-[20px] font-bold leading-7 text-[var(--on-surface)] sm:text-[22px]">
                Send feedback
              </h2>
              <p className="mt-1.5 text-[14px] leading-6 text-[var(--on-surface-variant)]">
                Use this form for quick notes, private contact details, or course data corrections.
              </p>
            </div>

            <FeedbackForm />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
