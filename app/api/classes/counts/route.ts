import { NextRequest, NextResponse } from "next/server";

import { getSnapshotCacheHeaders } from "@/lib/data/cache";
import { getClassCountsByCourseCodes } from "@/lib/data/queries";
import { semesterIdSchema } from "@/lib/validation/timetable";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const semesterId = semesterIdSchema.parse(request.nextUrl.searchParams.get("semesterId"));
  const courseCodes = request.nextUrl.searchParams
    .get("courseCodes")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) ?? [];

  const counts = await getClassCountsByCourseCodes(courseCodes, semesterId);

  return NextResponse.json(
    { counts },
    {
      headers: getSnapshotCacheHeaders(),
    },
  );
}
