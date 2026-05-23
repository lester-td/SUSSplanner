import { NextRequest, NextResponse } from "next/server";

import { CACHE_TAG_GROUPS, getCacheHeaders } from "@/lib/cache-tags";
import { searchCourses } from "@/lib/db/queries";
import { parseCourseSearchFilters } from "@/lib/timetable/course-search";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const courses = await searchCourses(parseCourseSearchFilters(request.nextUrl.searchParams));

  return NextResponse.json(
    { courses },
    {
      headers: getCacheHeaders("s-maxage=300, stale-while-revalidate=3600", CACHE_TAG_GROUPS.courseSearch),
    },
  );
}
