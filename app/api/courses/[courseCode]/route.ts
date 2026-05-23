import { NextRequest, NextResponse } from "next/server";

import { CACHE_TAG_GROUPS, getCacheHeaders } from "@/lib/cache-tags";
import {
  getAssessmentComponents,
  getCourseByCode,
  getCourseClasses,
} from "@/lib/db/queries";
import { optionalSemesterIdSchema, scheduleTypeSchema } from "@/lib/validation/timetable";

export const runtime = "nodejs";
const COURSE_DETAIL_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=86400";

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

  return NextResponse.json(
    { course, classes, assessmentComponents },
    {
      headers: getCacheHeaders(COURSE_DETAIL_CACHE_CONTROL, CACHE_TAG_GROUPS.courseDetail),
    },
  );
}
