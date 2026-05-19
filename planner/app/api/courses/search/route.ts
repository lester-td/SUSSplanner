import { NextRequest, NextResponse } from "next/server";

import { searchCourses } from "@/lib/db/queries";
import { courseSearchSchema } from "@/lib/validation/timetable";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const parsed = courseSearchSchema.parse({
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    semesterId: request.nextUrl.searchParams.get("semesterId") ?? undefined,
    scheduleType: request.nextUrl.searchParams.get("scheduleType") ?? undefined,
    postgraduate: request.nextUrl.searchParams.get("postgraduate") ?? undefined,
    school: request.nextUrl.searchParams.get("school") ?? undefined,
    courseLevel: request.nextUrl.searchParams.get("courseLevel") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  const courses = await searchCourses(
    parsed.q ?? "",
    parsed.semesterId,
    parsed.scheduleType,
    parsed.postgraduate,
    parsed.school,
    parsed.courseLevel,
    parsed.limit,
  );

  return NextResponse.json({ courses });
}
