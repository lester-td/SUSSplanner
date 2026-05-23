import { NextRequest, NextResponse } from "next/server";

import { getClassCountsByCourseCodes } from "@/lib/db/queries";
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
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
