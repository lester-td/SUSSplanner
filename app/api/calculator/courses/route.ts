import { NextRequest, NextResponse } from "next/server";

import { getSnapshotCacheHeaders } from "@/lib/data/cache";
import { searchCalculatorCourses } from "@/lib/data/course-search";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const courses = await searchCalculatorCourses(query);

  return NextResponse.json({ courses }, { headers: getSnapshotCacheHeaders() });
}
