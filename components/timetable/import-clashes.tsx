import { formatEventDate, formatTimeRange } from "@/lib/timetable/date-utils";
import type { ImportClashAnalysis } from "@/lib/timetable/import-clashes";

export function ImportClashes({ analysis }: { analysis: ImportClashAnalysis })
{
  if (analysis.status === "complete" && analysis.clashes.length === 0) return null;
  return (
    <section aria-label="Timetable clashes" className="space-y-2 rounded-lg border border-[var(--outline-variant)] p-3">
      <h3 className="font-semibold text-[var(--on-surface)]">Timetable clashes</h3>
      {analysis.status !== "complete" ? (
        <p role="status">{analysis.status === "unavailable"
          ? "Clash analysis is unavailable. Check the timetable after importing."
          : "Some classes could not be checked. Other clashes may not be shown."}</p>
      ) : null}
      {analysis.clashes.some((item) => item.change === "unclassified") ? (
        <p>Some clashes could not be compared with your saved timetable.</p>
      ) : null}
      {([
        ["new", "New or changed clashes"],
        ["existing", "Existing clashes"],
        ["unclassified", "Clashes with unknown previous state"],
      ] as const).map(([change, title]) => {
        const clashes = analysis.clashes.filter((item) => item.change === change);
        return clashes.length > 0 ? (
          <details key={change} open={change !== "existing"}>
            <summary className="cursor-pointer font-semibold">{title} ({clashes.length})</summary>
            <ul className="mt-2 space-y-3 text-[var(--on-surface-variant)]">
              {clashes.map(({ clash }) => (
                <li key={clash.clashKey} className="break-words">
                  <p className="font-medium">{formatEventDate(clash.eventDate)}</p>
                  <ul className="mt-1 space-y-1">
                    {clash.events.map((event) => (
                      <li key={`${event.shareKey}:${event.eventId}`}>
                        {event.courseLabel ?? event.courseCode} {event.groupCode} · {formatTimeRange(event.startTime, event.endTime)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        ) : null;
      })}
      <p>You can still import this timetable.</p>
    </section>
  );
}
