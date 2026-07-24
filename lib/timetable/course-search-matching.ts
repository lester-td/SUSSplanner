export type SearchableCourseRecord = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  courseSynopsis: string | null;
};

export function includesCourseSearchText(value: string | null, searchTerm: string)
{
  return value?.toLocaleLowerCase("en-SG").includes(searchTerm) ?? false;
}

export function courseMatchesSearchQuery(course: SearchableCourseRecord, rawSearchTerm: string)
{
  const searchTerm = rawSearchTerm.trim().toLocaleLowerCase("en-SG");

  return !searchTerm
    || includesCourseSearchText(course.courseCode, searchTerm)
    || includesCourseSearchText(course.courseName, searchTerm)
    || includesCourseSearchText(course.schoolName, searchTerm)
    || includesCourseSearchText(course.courseSynopsis, searchTerm);
}

export function getCourseSearchRank(course: SearchableCourseRecord, rawSearchTerm: string)
{
  if (!rawSearchTerm)
  {
    return 9;
  }

  const searchTerm = rawSearchTerm.toLocaleLowerCase("en-SG");
  const courseCode = course.courseCode.toLocaleLowerCase("en-SG");
  const courseName = course.courseName?.toLocaleLowerCase("en-SG") ?? "";
  const schoolName = course.schoolName?.toLocaleLowerCase("en-SG") ?? "";
  const synopsis = course.courseSynopsis?.toLocaleLowerCase("en-SG") ?? "";

  if (courseCode === searchTerm) return 0;
  if (courseCode.startsWith(searchTerm)) return 1;
  if (courseCode.includes(searchTerm)) return 2;
  if (courseName.startsWith(searchTerm)) return 3;
  if (courseName.includes(searchTerm)) return 4;
  if (schoolName.startsWith(searchTerm)) return 5;
  if (schoolName.includes(searchTerm)) return 6;
  if (synopsis.startsWith(searchTerm)) return 7;
  if (synopsis.includes(searchTerm)) return 8;
  return 9;
}
