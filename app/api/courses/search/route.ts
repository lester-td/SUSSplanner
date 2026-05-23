import { NextRequest, NextResponse } from "next/server";

import { searchCourses } from "@/lib/db/queries";
import { parseCourseSearchFilters } from "@/lib/timetable/course-search";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const courses = await searchCourses(parseCourseSearchFilters(request.nextUrl.searchParams));

  return NextResponse.json(
    { courses },
    {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
