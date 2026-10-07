import type { ExamStatus, SemesterRecord, TimetableBlock } from "@/lib/timetable/types";
import { getLatestEndMinutes } from "@/lib/timetable/timetable-utils";
import { START_MINUTES } from "@/lib/timetable/date-utils";

export type ExportCourse = {
  shareKey: string;
  courseCode: string;
  courseLabel?: string;
  courseName: string | null;
  groupCode: string;
  campuses?: string[];
  examDateLabel: string;
  examTimeLabel: string | null;
  examStatus: ExamStatus;
  examGuidance: string | null;
  creditUnits: number | null;
  continuationLabel?: string;
  color: string;
  hidden: boolean;
};

export function buildExportCourses(
  cards: Array<Omit<ExportCourse, "hidden">>,
  colors: Map<string, string>,
  hiddenClasses: string[] = [],
): ExportCourse[]
{
  return cards.map((card) => ({
    shareKey: card.shareKey,
    courseCode: card.courseCode,
    courseLabel: card.courseLabel,
    courseName: card.courseName,
    groupCode: card.groupCode,
    campuses: card.campuses,
    examDateLabel: card.examDateLabel,
    examTimeLabel: card.examTimeLabel,
    examStatus: card.examStatus,
    examGuidance: card.examGuidance,
    creditUnits: card.creditUnits,
    continuationLabel: card.continuationLabel,
    color: colors.get(card.shareKey) ?? card.color,
    hidden: hiddenClasses.includes(card.shareKey),
  }));
}

export function getExportTimeRange(blocks: TimetableBlock[])
{
  return { startMinutes: START_MINUTES, endMinutes: getLatestEndMinutes(blocks) };
}

export function getExportExamLabel(course: ExportCourse)
{
  return course.examStatus === "dated"
    ? `${course.examDateLabel}${course.examTimeLabel ? `, ${course.examTimeLabel}` : ""}`
    : course.examDateLabel;
}

export function getTimetableExportFileName(semester: SemesterRecord | null, extension: "png" | "pdf")
{
  const semesterName = semester?.semesterName.replace(/[^a-zA-Z0-9]/g, "") || "Timetable";
  return `SUSS-Planner-${semesterName}.${extension}`;
}
