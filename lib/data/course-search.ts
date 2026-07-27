import "server-only";

import {
  getCourseSearchMatch,
  includesCourseSearchText,
} from "@/lib/timetable/course-search-matching";
import type { CourseSearchFilters } from "@/lib/timetable/course-search";
import type { CourseSearchResult } from "@/lib/timetable/types";
import { getCourseIndexSnapshot } from "./course-index-reader";
import type { CourseIndexSnapshotRecord } from "./snapshot-types";

function toSearchResult(record: CourseIndexSnapshotRecord): CourseSearchResult
{
  const { offerings: _offerings, ...result } = record;
  return result;
}

export async function searchCourses({
  q,
  semesterIds,
  scheduleTypes,
  undergraduateOnly,
  postgraduateOnly,
  availableAsGspOnly,
  assessmentModes,
  schoolNames,
  courseLevels,
}: CourseSearchFilters)
{
  const records = await getCourseIndexSnapshot();
  const normalizedSearchTerm = q.trim().toLocaleLowerCase("en-SG");
  const selectedAssessmentModes = new Set(assessmentModes.map((value) => value.trim()).filter(Boolean));
  const selectedSemesterIds = new Set(semesterIds);
  const selectedScheduleTypes = new Set(scheduleTypes);
  const selectedSchools = new Set(schoolNames);
  const selectedCourseLevels = new Set(courseLevels);
  const hasClassFilters = selectedSemesterIds.size > 0
    || selectedScheduleTypes.size > 0
    || availableAsGspOnly;
  const matchesClassFilters = (offering: CourseIndexSnapshotRecord["offerings"][number]) => (
    (selectedSemesterIds.size === 0 || selectedSemesterIds.has(offering.semesterId))
    && (selectedScheduleTypes.size === 0 || selectedScheduleTypes.has(offering.scheduleType))
    && (!availableAsGspOnly || offering.availableAsGsp)
  );

  return records
    .map((record) => ({
      record,
      searchMatch: getCourseSearchMatch(record, normalizedSearchTerm),
    }))
    .filter(({ record, searchMatch }) => {
      if (normalizedSearchTerm && !searchMatch.matches)
      {
        return false;
      }

      if (postgraduateOnly && record.isPostgraduate !== true)
      {
        return false;
      }

      if (undergraduateOnly !== postgraduateOnly)
      {
        if (undergraduateOnly && record.isPostgraduate === true) return false;
        if (postgraduateOnly && record.isPostgraduate !== true) return false;
      }

      if (selectedSchools.size > 0 && (!record.schoolName || !selectedSchools.has(record.schoolName)))
      {
        return false;
      }

      if (selectedCourseLevels.size > 0 && (!record.courseLevel || !selectedCourseLevels.has(record.courseLevel)))
      {
        return false;
      }

      if (
        selectedAssessmentModes.size > 0
        && !record.assessmentModes.some((mode) => selectedAssessmentModes.has(mode))
      )
      {
        return false;
      }

      return !hasClassFilters || record.offerings.some(matchesClassFilters);
    })
    .sort((left, right) => (
      left.searchMatch.rank - right.searchMatch.rank
      || left.record.courseCode.localeCompare(right.record.courseCode)
    ))
    .map(({ record }) => {
      const result = toSearchResult(record);
      if (!hasClassFilters)
      {
        return result;
      }

      const availableClassCount = record.offerings
        .filter(matchesClassFilters)
        .reduce((total, offering) => total + offering.classCount, 0);
      return {
        ...result,
        availableClassCount,
        hasAvailableClasses: availableClassCount > 0,
      };
    });
}

export async function searchCalculatorCourses(searchTerm: string, limit = 8)
{
  const normalizedSearchTerm = searchTerm.trim().slice(0, 120).toLocaleLowerCase("en-SG");
  if (!normalizedSearchTerm)
  {
    return [];
  }

  const records = await getCourseIndexSnapshot();
  return records
    .map((record) => ({
      record,
      searchRank: getCourseSearchMatch(record, normalizedSearchTerm),
    }))
    .filter(({ record, searchRank }) => (
      searchRank.matches
      && (
        record.courseCode.toLocaleLowerCase("en-SG").includes(normalizedSearchTerm)
        || includesCourseSearchText(record.courseName, normalizedSearchTerm)
      )
    ))
    .sort((left, right) => (
      left.searchRank.rank - right.searchRank.rank
      || left.record.courseCode.localeCompare(right.record.courseCode)
    ))
    .slice(0, Math.min(20, Math.max(1, limit)))
    .map(({ record }) => ({
      courseCode: record.courseCode,
      courseName: record.courseName,
      creditUnits: record.creditUnits,
    }));
}

export async function getCoursesWithAvailableClasses(
  semesterId: number,
  scheduleType?: "daytime" | "evening",
)
{
  return searchCourses({
    q: "",
    semesterIds: [semesterId],
    scheduleTypes: scheduleType ? [scheduleType] : [],
    undergraduateOnly: false,
    postgraduateOnly: false,
    availableAsGspOnly: false,
    assessmentModes: [],
    schoolNames: [],
    courseLevels: [],
  });
}

export async function getCourseSearchFacets()
{
  const records = await getCourseIndexSnapshot();
  return {
    schools: [...new Set(records.map((record) => record.schoolName).filter((value): value is string => Boolean(value)))].sort(),
    courseLevels: [...new Set(records.map((record) => record.courseLevel).filter((value): value is string => Boolean(value)))].sort(),
  };
}
