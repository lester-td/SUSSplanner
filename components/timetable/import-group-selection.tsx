import { buildSharedClassIdentifier } from "@/lib/timetable/share-url";
import type { SemesterRecord, SharedClassIdentifier } from "@/lib/timetable/types";

export function ImportGroupSelection({ groups, choices, semesters, onChange }: {
  groups: ReadonlyMap<string, SharedClassIdentifier[]>;
  choices: Readonly<Record<string, string>>;
  semesters: SemesterRecord[];
  onChange: (key: string, identifier: string) => void;
})
{
  return (
    <div className="space-y-5 text-sm">
      {[...groups].filter(([, selections]) => selections.length > 1).map(([key, selections]) => (
        <fieldset key={key} className="min-w-0 space-y-2">
          <legend className="font-semibold">Multiple groups detected for {selections[0].courseCode}</legend>
          <p className="text-[var(--on-surface-variant)]">Only one group can be selected for this enrolment.</p>
          {selections.map((selection) => {
            const identifier = buildSharedClassIdentifier(selection);
            const origin = selection.originSemesterId;
            return (
              <label key={identifier} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--outline-variant)] p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--primary)]">
                <input type="radio" name={`import-${key}`} value={identifier} checked={choices[key] === identifier}
                  onChange={() => onChange(key, identifier)} className="h-4 w-4 shrink-0 accent-[var(--primary)]" />
                <span className="min-w-0 break-words">{selection.courseCode} {selection.groupCode} · {selection.scheduleType}
                  {origin === undefined ? "" : ` · continuation from ${semesters.find((item) => item.semesterId === origin)?.semesterName ?? `semester ${origin}`}`}</span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
