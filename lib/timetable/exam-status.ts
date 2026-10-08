import type { AssessmentComponentRecord, ExamAssessmentMode } from "./types";

export function getExamAssessmentMode(assessments: AssessmentComponentRecord[]): ExamAssessmentMode | null
{
  const labels = assessments.map((assessment) => `${assessment.assessmentMode ?? ""} ${assessment.componentName}`.toLowerCase());
  if (labels.some((label) => /proctored\s+online\s+exam/.test(label))) return "Proctored Online Exam";
  if (labels.some((label) => /online\s+exam/.test(label))) return "Online Exam";
  if (labels.some((label) => /written\s+exam/.test(label))) return "Written Exam";
  if (labels.some((label) => /\bexam(?:ination)?\b/.test(label))) return "Exam";
  return null;
}

export function getUndatedExamLabel(mode: ExamAssessmentMode)
{
  return mode === "Proctored Online Exam" || mode === "Online Exam" ? mode : "Has an Exam";
}

export const UNDATED_EXAM_GUIDANCE = "Check with course instructor";
