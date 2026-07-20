import type {
  AssessmentComponentRecord,
  CourseClassRecord,
  CourseRecord,
  CourseSearchResult,
  ScheduleType,
  SemesterRecord,
  SemesterWeekRecord,
} from "@/lib/timetable/types";

export const DATA_SNAPSHOT_FORMAT_VERSION = 2;

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

export type ScheduleSnapshot = {
  semesterId: number;
  courseCode: string;
  classes: CourseClassRecord[];
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
  courseFiles: Record<string, string>;
  scheduleFiles: Record<string, Record<string, string>>;
};
