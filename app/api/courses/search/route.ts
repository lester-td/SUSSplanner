import { NextRequest, NextResponse } from "next/server";

import { getSnapshotCacheHeaders } from "@/lib/data/cache";
import { searchCourses } from "@/lib/data/queries";
import { parseCourseSearchFilters } from "@/lib/timetable/course-search";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const courses = await searchCourses(parseCourseSearchFilters(request.nextUrl.searchParams));

  return NextResponse.json(
    { courses },
    {
      headers: getSnapshotCacheHeaders(),
    },
  );
}
