import type { Metadata } from "next";

import { FeedbackForm } from "@/components/feedback/feedback-form";
import { AppShell } from "@/components/layout/app-shell";
import { ArrowUpRightIcon, CodeIcon, EditIcon, ListIcon } from "@/components/planner/icons";
import { getLatestDataUpdatedAt, getSemestersWithWeeks } from "@/lib/data/metadata";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";

export const metadata: Metadata = {
  title: "Feedback | SUSS Planner",
  description: "Send feedback, report bugs, or flag incorrect SUSS Planner course data.",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

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
      contentFrameClassName="app-aero-frame"
    >
      <div className="feedback-page -mx-3 sm:mx-0">
        <div className="grid gap-0 sm:gap-5 lg:gap-6">
          <header className="px-3 pb-4 pt-3 sm:px-0 sm:pb-0 md:pt-8">
            <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:text-[32px] sm:leading-10 sm:tracking-normal">
              Feedback
            </h1>
            <p className="mt-1.5 max-w-3xl text-[13px] leading-5 text-[var(--on-surface-variant)] sm:mt-2 sm:text-[15px] sm:leading-7">
              Help improve SUSS Planner by opening a public GitHub issue or sending a private feedback form to the maintainers.
            </p>
          </header>

          <div className="grid min-w-0 gap-0 sm:gap-5 lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start">
            <aside className="grid min-w-0 gap-0 sm:gap-4">
              <section aria-labelledby="useful-details-heading" className="feedback-info-tile feedback-info-tile--details min-w-0 rounded-none border-t p-4 sm:rounded-[1rem] sm:border">
                <div className="flex items-center gap-3">
                  <span className="feedback-info-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem]">
                    <ListIcon className="h-5 w-5" />
                  </span>
                  <h2 id="useful-details-heading" className="text-[16px] font-bold leading-6 text-[var(--on-surface)]">Useful details</h2>
                </div>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px] sm:leading-6">
                  <li>Course code or class group</li>
                  <li>Semester and schedule type</li>
                  <li>What you expected to see</li>
                  <li>What happened instead</li>
                </ul>
              </section>

              <section aria-labelledby="public-issues-heading" className="feedback-info-tile feedback-info-tile--issues min-w-0 rounded-none border-t p-4 sm:rounded-[1rem] sm:border">
                <div className="flex items-center gap-3">
                  <span className="feedback-info-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem]">
                    <CodeIcon className="h-5 w-5" />
                  </span>
                  <h2 id="public-issues-heading" className="text-[16px] font-bold leading-6 text-[var(--on-surface)]">Public issues</h2>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px] sm:leading-6">
                  For bugs and feature requests that others can follow, open an issue on GitHub.
                </p>
                <a
                  href="https://github.com/Simplificatedd/SUSSplanner/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="app-feedback-button mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-bold leading-4 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring-soft)]"
                >
                  GitHub Issues
                  <ArrowUpRightIcon className="h-4 w-4" />
                </a>
              </section>
            </aside>

            <section aria-labelledby="send-feedback-heading" className="app-aero-panel feedback-section min-w-0 overflow-hidden">
              <div className="app-aero-panel-heading">
                <EditIcon className="h-5 w-5 text-[var(--primary)]" />
                <h2 id="send-feedback-heading" className="text-[15px] font-bold leading-5 tracking-[-0.02em] sm:text-[17px]">
                  Send feedback
                </h2>
              </div>
              <div className="p-4 sm:p-5">
                <FeedbackForm />
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
