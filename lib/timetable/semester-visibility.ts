import type { SemesterRecord } from "./types";

export function getActiveSemesters<T extends SemesterRecord>(semesters: T[]): T[]
{
  return semesters.filter(semester => !semester.isArchived);
}

export function getSemesterChoices<T extends SemesterRecord>(semesters: T[]): T[]
{
  return getActiveSemesters(semesters).filter(semester => semester.hasIntakeSchedule !== false);
}

export function getIntakeScheduleNotice(semester: SemesterRecord | null): string | null
{
  return semester?.hasIntakeSchedule === false
    ? `${semester.semesterName} intake schedules are not yet available. Only continuation sessions from earlier semesters are shown.`
    : null;
}
