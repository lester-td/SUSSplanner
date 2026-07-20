import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { ShareClient } from "@/components/timetable/share-client";
import { getLatestDataUpdatedAt, getSemestersWithWeeks, getTimetableDataFromClassIdentifiers } from "@/lib/data/queries";
import { getCurrentSemesterContext } from "@/lib/timetable/date-utils";
import { decodeShareUrlState } from "@/lib/timetable/share-url";

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [semesterTree, latestDataUpdatedAt, rawSearchParams] = await Promise.all([
    getSemestersWithWeeks(),
    getLatestDataUpdatedAt(),
    searchParams,
  ]);

  const currentSemesterContext = getCurrentSemesterContext(
    semesterTree.map(({ weeks, ...semesterData }) => semesterData),
    semesterTree.flatMap((item) => item.weeks),
  );

  const hasShareParams = Boolean(
    (typeof rawSearchParams.sem === "string" && rawSearchParams.sem)
      || (typeof rawSearchParams.classes === "string" && rawSearchParams.classes),
  );

  if (!hasShareParams)
  {
    return (
      <AppShell
        activeSection="share"
        currentSemesterContext={currentSemesterContext}
        dataUpdatedAt={latestDataUpdatedAt}
        contentLayout="full-bleed"
      >
        <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-3 py-3 md:px-[16px]">
          <div className="w-full max-w-xl rounded-[0.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] px-6 py-8 text-center shadow-sm">
            <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:font-semibold sm:leading-8 sm:tracking-[-0.01em]">Shared timetable</h1>
            <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px]">
              Open a shared timetable URL here to preview it in read-only mode, compare clashes, and import it into your saved planner only if you choose to.
            </p>
            <Link href="/timetable" className="mt-6 inline-flex rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-on-primary transition-colors hover:bg-[var(--primary-container)] hover:text-on-primary">
              Open timetable
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  let decodedState;
  try
  {
    decodedState = decodeShareUrlState(rawSearchParams);
  }
  catch {
    return (
      <AppShell
        activeSection="share"
        currentSemesterContext={currentSemesterContext}
        dataUpdatedAt={latestDataUpdatedAt}
        contentLayout="full-bleed"
      >
        <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-3 py-3 md:px-[16px]">
          <div className="w-full max-w-xl rounded-[0.5rem] border border-[var(--brand-divider)] bg-[var(--surface-container-lowest)] px-6 py-8 text-center shadow-sm">
            <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.035em] text-[var(--on-surface)] sm:font-semibold sm:leading-8 sm:tracking-[-0.01em]">Invalid shared link</h1>
            <p className="mt-2 text-[13px] leading-5 text-[var(--on-surface-variant)] sm:text-[14px]">
              This share URL is missing required timetable information or has malformed class identifiers.
            </p>
            <Link href="/timetable" className="mt-6 inline-flex rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-on-primary transition-colors hover:bg-[var(--primary-container)] hover:text-on-primary">
              Open timetable
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const timetable = await getTimetableDataFromClassIdentifiers(decodedState.selectedClasses, decodedState.semesterId);

  return (
    <AppShell
      activeSection="share"
      currentSemesterContext={currentSemesterContext}
      dataUpdatedAt={latestDataUpdatedAt}
      contentLayout="full-bleed"
    >
      <ShareClient sharedState={decodedState} timetable={timetable} />
    </AppShell>
  );
}
