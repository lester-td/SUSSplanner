export type ScheduleType = "daytime" | "evening";
export type GroupCodeType = "TG" | "CRN";
export type EventKind = "CLASS" | "EXAM" | "OTHER";
export type ExamAssessmentMode = "Proctored Online Exam" | "Online Exam" | "Written Exam" | "Exam";
export type ExamStatus = "dated" | "undated" | "eca" | "none";
export type WeekType = "TEACHING" | "STUDY" | "EXAM";
export type PlannerSection = "planner" | "semester-planner" | "courses" | "share";
export type PlannerViewMode = "class" | "exam";
export type TimetableOrientation = "horizontal" | "vertical";
export type TimetableStudyMode = "full-time" | "part-time";

export type SharedClassIdentifier = {
  courseCode: string;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  originSemesterId?: number;
};

export type SharedTimetableState = {
  semesterId: number;
  selectedClasses: SharedClassIdentifier[];
};

export type PlannerSemesterState = SharedTimetableState & {
  hiddenClasses: string[];
  courseColorsByCourseCode: Record<string, string>;
  selectedWeekId: number | "all";
};

export type PlannerStorageState = PlannerSemesterState & {
  orientation: TimetableOrientation;
  viewMode: PlannerViewMode;
  semesterStates?: Record<string, PlannerSemesterState>;
};

export type SemesterRecord = {
  semesterId: number;
  academicYear: string;
  semesterNo: 1 | 2 | 3;
  semesterName: string;
  // Older generated snapshots do not contain this field.
  isArchived?: boolean;
  // Missing in older snapshots; false means only continuation sessions are available.
  hasIntakeSchedule?: boolean;
};

export type SemesterWeekRecord = {
  weekId: number;
  semesterId: number;
  weekNo: number;
  weekType: WeekType;
  label: string;
  startDate: string;
  endDate: string;
};

export type CourseSearchResult = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  isPostgraduate: boolean | null;
  courseLevel: string | null;
  creditUnits: number | null;
  presentationPattern: string | null;
  courseSynopsis: string | null;
  hasAvailableClasses: boolean;
  availableClassCount: number;
  offeredSemesters: SemesterRecord[];
  // Includes continuation destinations, even when their intake schedule is unavailable.
  scheduledSemesters?: SemesterRecord[];
  scheduleTypes: ScheduleType[];
  availableAsGsp: boolean;
  assessmentModes: string[];
};

export type CourseRecord = {
  courseCode: string;
  courseName: string | null;
  schoolName: string | null;
  isPostgraduate: boolean | null;
  courseLevel: string | null;
  creditUnits: number | null;
  presentationPattern: string | null;
  courseSynopsis: string | null;
  courseTopics: unknown;
  learningOutcomes: unknown;
  synopsisUrl: string | null;
};

export type AssessmentComponentRecord = {
  componentId: number;
  courseCode: string;
  scheduleType: ScheduleType;
  componentName: string;
  componentGroup: "OCAS" | "OES";
  assessmentMode: string | null;
  weightPercentage: number;
  sortOrder: number;
};

export type ClassRecord = {
  classId: number;
  courseCode: string;
  semesterId: number;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  // Older generated snapshots do not contain this field.
  language?: string | null;
  availableAsGsp: boolean | null;
  isRestricted: boolean | null;
  remarks: string | null;
};

export type ClassEventRecord = {
  eventId: number;
  classId: number;
  eventKind: EventKind;
  eventDate: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  eventMode: string | null;
  campus: string | null;
  remarks: string | null;
};

export type ClassEventWithWeekRecord = ClassEventRecord & {
  courseCode: string;
  semesterId: number;
  startSemesterId?: number;
  // Explicitly owned sessions before the intake's nominal calendar start.
  isPreTerm?: boolean;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  weekId: number | null;
  weekNo: number | null;
  weekType: WeekType | null;
  weekLabel: string | null;
};

export type CourseClassRecord = ClassRecord & {
  // Explicit continuation targets in newly generated snapshots.
  continuationSemesterIds?: number[];
  courseName: string | null;
  schoolName: string | null;
  creditUnits: number | null;
  presentationPattern: string | null;
  events: ClassEventWithWeekRecord[];
};

export type TimetableSelectionRecord = Omit<CourseClassRecord, "events"> & {
  events: TimetableEventRecord[];
  identifier: SharedClassIdentifier;
  shareKey: string;
  hasEca: boolean;
  examAssessmentMode: ExamAssessmentMode | null;
  courseLabel?: string;
};

export type TimetableEventRecord = ClassEventWithWeekRecord & {
  courseName: string | null;
  schoolName: string | null;
  shareKey: string;
  originSemesterId?: number;
  courseLabel?: string;
};

export type TimetableClash = {
  clashKey: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  events: TimetableEventRecord[];
};

export type TimetableData = {
  semester: SemesterRecord | null;
  semesterWeeks: SemesterWeekRecord[];
  selections: TimetableSelectionRecord[];
  events: TimetableEventRecord[];
  // Complete sessions for the resolved class cohorts, used by the PDF listing.
  classSessionEvents?: TimetableEventRecord[];
  clashes: TimetableClash[];
  unresolvedSelections: SharedClassIdentifier[];
};

export type TimetableBlock = {
  id: string;
  shareKey: string;
  courseCode: string;
  courseName: string | null;
  groupCode: string;
  groupCodeType: GroupCodeType;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  weekLabel: string;
  continuationLabel?: string;
  originSemesterId?: number;
  courseLabel?: string;
  campus: string | null;
  eventMode: string | null;
  occurrenceCount: number;
  eventIds: number[];
};

export type ExamCard = {
  id: string;
  shareKey: string;
  courseCode: string;
  courseLabel?: string;
  courseName: string | null;
  groupCode: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  examMode: string | null;
};
