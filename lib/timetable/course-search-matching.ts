export type SearchableCourseRecord = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  courseSynopsis: string | null;
};

export type CourseSearchMatch = {
  matches: boolean;
  rank: number;
};

const NO_MATCH_RANK = Number.MAX_SAFE_INTEGER;
const COURSE_CODE_EXACT_RANK = 0;
const COURSE_CODE_PREFIX_RANK = 1;
const COURSE_CODE_CONTAINS_RANK = 2;
const COURSE_CODE_FUZZY_RANK = 4;
const COURSE_NAME_EXACT_RANK = 10;
const COURSE_NAME_PREFIX_RANK = 11;
const COURSE_NAME_CONTAINS_RANK = 12;
const COURSE_NAME_FUZZY_RANK = 14;
const SCHOOL_NAME_EXACT_RANK = 20;
const SCHOOL_NAME_PREFIX_RANK = 21;
const SCHOOL_NAME_CONTAINS_RANK = 22;
const SCHOOL_NAME_FUZZY_RANK = 24;
const SYNOPSIS_EXACT_RANK = 30;
const SYNOPSIS_PREFIX_RANK = 31;
const SYNOPSIS_CONTAINS_RANK = 32;
const SYNOPSIS_FUZZY_RANK = 34;

function normalizeSearchText(value: string)
{
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("en-SG")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function compactSearchText(value: string)
{
  return normalizeSearchText(value).replace(/\s/g, "");
}

export function getCourseSearchTerms(rawSearchTerm: string)
{
  return normalizeSearchText(rawSearchTerm)
    .split(" ")
    .filter(Boolean);
}

export function includesCourseSearchText(value: string | null, searchTerm: string)
{
  const normalizedSearchTerm = normalizeSearchText(searchTerm);
  return Boolean(normalizedSearchTerm && value && normalizeSearchText(value).includes(normalizedSearchTerm));
}

function getMaxFuzzyDistance(term: string)
{
  if (term.length < 4) return 0;
  if (term.length <= 6) return 1;
  return 2;
}

function getLevenshteinDistance(left: string, right: string, maxDistance: number)
{
  if (Math.abs(left.length - right.length) > maxDistance)
  {
    return maxDistance + 1;
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1)
  {
    const currentRow = [leftIndex + 1];
    let rowMinimum = currentRow[0];

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1)
    {
      const insertionCost = currentRow[rightIndex] + 1;
      const deletionCost = previousRow[rightIndex + 1] + 1;
      const substitutionCost = previousRow[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1);
      const nextCost = Math.min(insertionCost, deletionCost, substitutionCost);

      currentRow.push(nextCost);
      rowMinimum = Math.min(rowMinimum, nextCost);
    }

    if (rowMinimum > maxDistance)
    {
      return maxDistance + 1;
    }

    previousRow = currentRow;
  }

  return previousRow[right.length];
}

function getFuzzyRank(normalizedValue: string, term: string, baseRank: number)
{
  const maxDistance = getMaxFuzzyDistance(term);
  if (maxDistance === 0)
  {
    return NO_MATCH_RANK;
  }

  const candidates = [
    ...normalizedValue.split(" "),
    normalizedValue.replace(/\s/g, ""),
  ].filter((candidate) => candidate.length >= term.length - maxDistance);

  let bestDistance = maxDistance + 1;

  for (const candidate of candidates)
  {
    const distance = getLevenshteinDistance(term, candidate, maxDistance);
    if (distance < bestDistance)
    {
      bestDistance = distance;
    }
  }

  return bestDistance <= maxDistance ? baseRank + bestDistance : NO_MATCH_RANK;
}

function getFieldTermRank(
  value: string | null,
  term: string,
  exactRank: number,
  prefixRank: number,
  containsRank: number,
  fuzzyRank: number,
)
{
  if (!value)
  {
    return NO_MATCH_RANK;
  }

  const normalizedValue = normalizeSearchText(value);
  if (!normalizedValue)
  {
    return NO_MATCH_RANK;
  }

  if (normalizedValue === term) return exactRank;
  if (normalizedValue.startsWith(term)) return prefixRank;
  if (normalizedValue.includes(term)) return containsRank;

  const compactValue = compactSearchText(value);
  if (compactValue === term) return exactRank;
  if (compactValue.startsWith(term)) return prefixRank;
  if (compactValue.includes(term)) return containsRank;

  return getFuzzyRank(normalizedValue, term, fuzzyRank);
}

function getBestTermRank(course: SearchableCourseRecord, term: string)
{
  return Math.min(
    getFieldTermRank(
      course.courseCode,
      term,
      COURSE_CODE_EXACT_RANK,
      COURSE_CODE_PREFIX_RANK,
      COURSE_CODE_CONTAINS_RANK,
      COURSE_CODE_FUZZY_RANK,
    ),
    getFieldTermRank(
      course.courseName,
      term,
      COURSE_NAME_EXACT_RANK,
      COURSE_NAME_PREFIX_RANK,
      COURSE_NAME_CONTAINS_RANK,
      COURSE_NAME_FUZZY_RANK,
    ),
    getFieldTermRank(
      course.schoolName,
      term,
      SCHOOL_NAME_EXACT_RANK,
      SCHOOL_NAME_PREFIX_RANK,
      SCHOOL_NAME_CONTAINS_RANK,
      SCHOOL_NAME_FUZZY_RANK,
    ),
    getFieldTermRank(
      course.courseSynopsis,
      term,
      SYNOPSIS_EXACT_RANK,
      SYNOPSIS_PREFIX_RANK,
      SYNOPSIS_CONTAINS_RANK,
      SYNOPSIS_FUZZY_RANK,
    ),
  );
}

export function courseMatchesSearchQuery(course: SearchableCourseRecord, rawSearchTerm: string)
{
  return getCourseSearchMatch(course, rawSearchTerm).matches;
}

export function getCourseSearchMatch(course: SearchableCourseRecord, rawSearchTerm: string): CourseSearchMatch
{
  const terms = getCourseSearchTerms(rawSearchTerm);
  if (terms.length === 0)
  {
    return {
      matches: true,
      rank: 9,
    };
  }

  let rank = 0;

  for (const term of terms)
  {
    const termRank = getBestTermRank(course, term);
    if (termRank >= NO_MATCH_RANK)
    {
      return {
        matches: false,
        rank: NO_MATCH_RANK,
      };
    }

    rank += termRank;
  }

  return {
    matches: true,
    rank,
  };
}

export function getCourseSearchRank(course: SearchableCourseRecord, rawSearchTerm: string)
{
  return getCourseSearchMatch(course, rawSearchTerm).rank;
}
