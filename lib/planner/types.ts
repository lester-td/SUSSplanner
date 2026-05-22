export type StudyPlanCourseSource = "catalog" | "manual";

export type StudyPlanCourse = {
  id: string;
  courseCode: string;
  courseName: string;
  schoolName: string | null;
  creditUnits: number;
  semesterSpan: number;
  assignedSemester: number | null;
  source: StudyPlanCourseSource;
};

export type StudyPlanState = {
  totalCreditsGoal: number;
  numSemesters: number;
  courses: StudyPlanCourse[];
};
