import { NextRequest, NextResponse } from "next/server";

import {
  getAssessmentComponents,
  getCourseByCode,
  getCourseClasses,
} from "@/lib/db/queries";
import { optionalSemesterIdSchema, scheduleTypeSchema } from "@/lib/validation/timetable";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ courseCode: string }> },
)
{
  const { courseCode } = await context.params;
  const semesterId = optionalSemesterIdSchema.parse(request.nextUrl.searchParams.get("semesterId") ?? undefined);
  const rawScheduleType = request.nextUrl.searchParams.get("scheduleType");
  const scheduleType = rawScheduleType ? scheduleTypeSchema.parse(rawScheduleType) : undefined;

  const course = await getCourseByCode(courseCode);
  if (!course)
  {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const [classes, assessmentComponents] = await Promise.all([
    getCourseClasses(courseCode, semesterId, scheduleType),
    getAssessmentComponents(courseCode, scheduleType),
  ]);

  return NextResponse.json({ course, classes, assessmentComponents });
}
