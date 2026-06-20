export type SemesterPlannerCourseSource = "catalog" | "manual";

export type SemesterPlannerCourse = {
  id: string;
  courseCode: string;
  courseName: string;
  schoolName: string | null;
  creditUnits: number;
  semesterSpan: number;
  assignedSemester: number | null;
  source: SemesterPlannerCourseSource;
};

export type SemesterPlannerState = {
  totalCreditsGoal: number;
  numSemesters: number;
  courses: SemesterPlannerCourse[];
};
