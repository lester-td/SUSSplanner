import type {
  AssessmentComponentRecord,
  CourseClassRecord,
  CourseRecord,
  CourseSearchResult,
  ScheduleType,
  SemesterRecord,
  SemesterWeekRecord,
} from "@/lib/timetable/types";

export const DATA_SNAPSHOT_FORMAT_VERSION = 1;
export const DATA_SNAPSHOT_BUCKET_COUNT = 16;

export function getDataSnapshotBucket(courseCode: string)
{
  let hash = 2166136261;
  for (const character of courseCode.trim().toUpperCase())
  {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return ((hash >>> 0) % DATA_SNAPSHOT_BUCKET_COUNT).toString(16).padStart(2, "0");
}

export type AcademicCalendarEventRecord = {
  eventId: number;
  calendarYear: number;
  audience: "FTUG" | "PTUG" | "LAW" | "GRAD";
  eventTitle: string;
  eventCategory: string;
  startDate: string;
  endDate: string;
  status: "confirmed" | "tentative" | "cancelled";
  sourceUrl: string | null;
  remarks: string | null;
  sortOrder: number;
  semesters: SemesterRecord[];
};

export type CourseOfferingSnapshot = {
  semesterId: number;
  scheduleType: ScheduleType;
  availableAsGsp: boolean;
  classCount: number;
};

export type CourseIndexSnapshotRecord = CourseSearchResult & {
  offerings: CourseOfferingSnapshot[];
};

export type CourseSnapshot = {
  course: CourseRecord;
  assessments: AssessmentComponentRecord[];
  offeredSemesters: SemesterRecord[];
};

export type CourseSnapshotBucket = Record<string, CourseSnapshot>;

export type ScheduleSnapshot = {
  semesterId: number;
  courseCode: string;
  classes: CourseClassRecord[];
};

export type ScheduleSnapshotBucket = {
  semesterId: number;
  courses: Record<string, CourseClassRecord[]>;
};

export type DataSnapshotManifest = {
  formatVersion: typeof DATA_SNAPSHOT_FORMAT_VERSION;
  generatedAt: string;
  dataUpdatedAt: string | null;
  coverage: {
    courseCount: number;
    classCount: number;
    semesterCount: number;
    assessmentCount: number;
  };
  semesters: Array<SemesterRecord & { weeks: SemesterWeekRecord[] }>;
  academicCalendarEvents: AcademicCalendarEventRecord[];
  courseBucketFiles: Record<string, string>;
  scheduleBucketFiles: Record<string, Record<string, string>>;
};
