export type ScheduleType = "daytime" | "evening";
export type GroupCodeType = "TG" | "CRN";
export type EventKind = "CLASS" | "EXAM" | "OTHER";
export type WeekType = "TEACHING" | "STUDY" | "EXAM";
export type PlannerSection = "planner" | "courses" | "share";
export type PlannerViewMode = "class" | "exam";
export type TimetableOrientation = "horizontal" | "vertical";

export type SharedClassIdentifier = {
  courseCode: string;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
};

export type SharedTimetableState = {
  semesterId: number;
  selectedClasses: SharedClassIdentifier[];
};

export type PlannerStorageState = SharedTimetableState & {
  hiddenClasses: string[];
  selectedWeekId: number | "all";
  orientation: TimetableOrientation;
  viewMode: PlannerViewMode;
};

export type SemesterRecord = {
  semesterId: number;
  academicYear: string;
  semesterNo: 1 | 2 | 3;
  semesterName: string;
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
  venue: string | null;
  remarks: string | null;
};

export type ClassEventWithWeekRecord = ClassEventRecord & {
  courseCode: string;
  semesterId: number;
  scheduleType: ScheduleType;
  groupCodeType: GroupCodeType;
  groupCode: string;
  weekId: number | null;
  weekNo: number | null;
  weekType: WeekType | null;
  weekLabel: string | null;
};

export type CourseClassRecord = ClassRecord & {
  courseName: string | null;
  schoolName: string | null;
  creditUnits: number | null;
  presentationPattern: string | null;
  events: ClassEventWithWeekRecord[];
};

export type TimetableSelectionRecord = CourseClassRecord & {
  identifier: SharedClassIdentifier;
  shareKey: string;
  hasEca: boolean;
};

export type TimetableEventRecord = ClassEventWithWeekRecord & {
  courseName: string | null;
  schoolName: string | null;
  shareKey: string;
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
  venue: string | null;
  eventMode: string | null;
  occurrenceCount: number;
  eventIds: number[];
};

export type ExamCard = {
  id: string;
  shareKey: string;
  courseCode: string;
  courseName: string | null;
  groupCode: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  examMode: string | null;
};
