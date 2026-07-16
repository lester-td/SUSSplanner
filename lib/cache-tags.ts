export const CACHE_TAGS = {
  semesters: "semesters",
  semesterWeeks: "semester-weeks",
  academicCalendarEvents: "academic-calendar-events",
  classes: "classes",
  courses: "courses",
  assessments: "assessments",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export const CACHE_TAG_VALUES = Object.values(CACHE_TAGS) as CacheTag[];

export const CACHE_TAG_GROUPS = {
  classData: [
    CACHE_TAGS.classes,
    CACHE_TAGS.courses,
    CACHE_TAGS.semesters,
    CACHE_TAGS.semesterWeeks,
  ],
  timetableData: [
    CACHE_TAGS.classes,
    CACHE_TAGS.courses,
    CACHE_TAGS.semesters,
    CACHE_TAGS.semesterWeeks,
    CACHE_TAGS.assessments,
  ],
  classCounts: [
    CACHE_TAGS.classes,
  ],
  courseSearch: [
    CACHE_TAGS.courses,
    CACHE_TAGS.classes,
    CACHE_TAGS.semesters,
    CACHE_TAGS.assessments,
  ],
  courseDetail: [
    CACHE_TAGS.courses,
    CACHE_TAGS.classes,
    CACHE_TAGS.assessments,
  ],
} as const satisfies Record<string, readonly CacheTag[]>;

export function isCacheTag(value: string): value is CacheTag
{
  return CACHE_TAG_VALUES.includes(value as CacheTag);
}

export function getCacheHeaders(cacheControl: string, tags: readonly CacheTag[])
{
  return {
    "Cache-Control": cacheControl,
    "Vercel-Cache-Tag": tags.join(","),
  };
}
