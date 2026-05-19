import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { ShareClient } from "@/components/timetable/share-client";
import { getSemestersWithWeeks, getTimetableDataFromClassIdentifiers } from "@/lib/db/queries";
import { getCurrentSemesterContext, getCurrentWeekChip } from "@/lib/timetable/date-utils";
import { decodeShareUrlState } from "@/lib/timetable/share-url";

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
})
{
  const [semesterTree, rawSearchParams] = await Promise.all([
    getSemestersWithWeeks(),
    searchParams,
  ]);

  const { semester, week } = getCurrentSemesterContext(
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
      <AppShell activeSection="share" currentWeekLabel={getCurrentWeekChip(semester, week)}>
        <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-6 md:px-[16px]">
          <div className="w-full max-w-xl rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-8 py-10 text-center shadow-sm">
            <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[var(--on-surface)]">Shared timetable</h1>
            <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              Open a shared timetable URL here to preview it in read-only mode, compare clashes, and import it into your saved planner only if you choose to.
            </p>
            <Link href="/planner" className="mt-6 inline-flex rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]">
              Open planner
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
      <AppShell activeSection="share" currentWeekLabel={getCurrentWeekChip(semester, week)}>
        <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-6 md:px-[16px]">
          <div className="w-full max-w-xl rounded-[0.5rem] border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-8 py-10 text-center shadow-sm">
            <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[var(--on-surface)]">Invalid shared link</h1>
            <p className="mt-2 text-[14px] leading-5 text-[var(--on-surface-variant)]">
              This share URL is missing required timetable information or has malformed class identifiers.
            </p>
            <Link href="/planner" className="mt-6 inline-flex rounded-[0.25rem] bg-[var(--primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-[var(--on-primary)] transition-colors hover:bg-[var(--primary-container)] hover:text-[var(--on-primary-container)]">
              Open planner
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const timetable = await getTimetableDataFromClassIdentifiers(decodedState.selectedClasses, decodedState.semesterId);

  return (
    <AppShell activeSection="share" currentWeekLabel={getCurrentWeekChip(timetable.semester ?? semester, week)}>
      <ShareClient sharedState={decodedState} timetable={timetable} />
    </AppShell>
  );
}
