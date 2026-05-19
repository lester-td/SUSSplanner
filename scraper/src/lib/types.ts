export type SemesterNo = 1 | 2 | 3;
export type ScheduleType = "daytime" | "evening";
export type GroupCodeType = "TG" | "CRN";
export type EventKind = "CLASS" | "EXAM" | "OTHER";
export type ComponentGroup = "OCAS" | "OES";

export interface SemesterKey {
  academicYear: string;
  semesterNo: SemesterNo;
  semesterName: string;
}

export interface CourseRecord {
  courseCode: string;
  courseName?: string | null;
  schoolName?: string | null;
  isPostgraduate?: boolean | null;
  courseLevel?: string | null;
  creditUnits?: number | null;
  presentationPattern?: string | null;
  courseSynopsis?: string | null;
  courseTopics?: unknown[] | null;
  learningOutcomes?: unknown[] | null;
  synopsisUrl?: string | null;
  lastScrapedAt?: string | null;
}

export interface ClassRecord {
  courseCode: string;
  academicYear: string;
  semesterNo: SemesterNo;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  availableAsGsp?: boolean | null;
  isRestricted?: boolean | null;
  remarks?: string | null;
}

export interface ClassEventRecord {
  courseCode: string;
  academicYear: string;
  semesterNo: SemesterNo;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  eventKind: EventKind;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
  eventMode?: string | null;
  venue?: string | null;
  remarks?: string | null;
}

export interface AssessmentComponentRecord {
  courseCode: string;
  scheduleType: ScheduleType;
  componentName: string;
  componentGroup: ComponentGroup;
  assessmentMode?: string | null;
  weightPercentage: number;
  sortOrder: number;
}

export interface SemesterWeekRecord {
  academicYear: string;
  semesterNo: SemesterNo;
  weekNo: number;
  weekType: "TEACHING" | "STUDY" | "EXAM";
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface ScheduleParseResult {
  semesters: SemesterKey[];
  courses: CourseRecord[];
  classes: ClassRecord[];
  classEvents: ClassEventRecord[];
  warnings: string[];
}

export interface CourseDetailParseResult {
  course: CourseRecord;
  scheduleType?: ScheduleType;
  sourcePath?: string;
  sourceUrl?: string;
  assessments: AssessmentComponentRecord[];
  warnings: string[];
}
