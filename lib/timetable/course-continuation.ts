import { inferCatalogSemesterSpan } from "@/lib/courses/semester-span";
import type {
  PlannerSemesterState,
  SemesterRecord,
  SharedClassIdentifier,
} from "@/lib/timetable/types";

export type CourseContinuationDisplay = {
  cardLines: string[];
  blockText: string;
};

function semesterIndexById(semesters: SemesterRecord[])
{
  return new Map(semesters.map((semester, index) => [semester.semesterId, index]));
}

export function formatContinuationSemesterShort(semesterName: string)
{
  const match = semesterName.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match)
  {
    return semesterName.trim();
  }

  return `${match[1].slice(0, 3)} '${match[2].slice(-2)}`;
}

export function getFollowingContinuationSemesters({
  courseCode,
  semesterId,
  offeredSemesters,
  semesters,
  continuationSemesterIds,
}: {
  courseCode: string;
  semesterId: number;
  offeredSemesters: SemesterRecord[];
  semesters: SemesterRecord[];
  continuationSemesterIds?: number[];
})
{
  if (continuationSemesterIds !== undefined) {
    return semesters.filter(semester => !semester.isArchived && continuationSemesterIds.includes(semester.semesterId))
      .sort((left, right) => left.academicYear.localeCompare(right.academicYear) || left.semesterNo - right.semesterNo);
  }
  const remainingSemesterCount = inferCatalogSemesterSpan(courseCode) - 1;
  if (remainingSemesterCount <= 0)
  {
    return [];
  }

  const orderedSemesters = [...semesters].sort((left, right) => (
    left.academicYear.localeCompare(right.academicYear) || left.semesterNo - right.semesterNo
  ));
  const indexById = semesterIndexById(orderedSemesters);
  const currentIndex = indexById.get(semesterId);
  if (currentIndex === undefined)
  {
    return [];
  }

  return offeredSemesters
    .filter((semester) => {
      const index = indexById.get(semester.semesterId);
      return index !== undefined && index > currentIndex;
    })
    .sort((left, right) => (
      (indexById.get(left.semesterId) ?? Number.POSITIVE_INFINITY)
      - (indexById.get(right.semesterId) ?? Number.POSITIVE_INFINITY)
    ))
    .slice(0, remainingSemesterCount);
}

export function getCourseContinuationDisplay({
  selection,
  semesterId,
  semesterStates,
  semesters,
}: {
  selection: SharedClassIdentifier;
  semesterId: number;
  semesterStates: Record<string, PlannerSemesterState> | undefined;
  semesters: SemesterRecord[];
}): CourseContinuationDisplay | null
{
  const previous = semesters.find((semester) => semester.semesterId === selection.originSemesterId);
  const next = semesters.find((semester) => (
    semesterStates?.[String(semester.semesterId)]?.selectedClasses.some((item) => (
      item.courseCode === selection.courseCode && item.originSemesterId === semesterId
    ))
  ));

  if (!previous && !next)
  {
    return null;
  }

  return {
    cardLines: previous
      ? [`Continued from ${previous.semesterName}`]
      : next ? [`Continues in ${next.semesterName}`] : [],
    blockText: !previous && next ? `Continues ${formatContinuationSemesterShort(next.semesterName)}` : "",
  };
}
