import { NextRequest, NextResponse } from "next/server";

import { CACHE_TAG_GROUPS, getCacheHeaders } from "@/lib/cache-tags";
import {
  getCourseClasses,
  getTimetableDataFromClassIdentifiers,
} from "@/lib/db/queries";
import { decodeShareUrlState } from "@/lib/timetable/share-url";
import {
  courseCodeSchema,
  optionalSemesterIdSchema,
  scheduleTypeSchema,
} from "@/lib/validation/timetable";

export const runtime = "nodejs";

const CLASS_RESPONSE_CACHE_CONTROL = "s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: NextRequest)
{
  const courseCode = request.nextUrl.searchParams.get("courseCode");
  const semesterId = optionalSemesterIdSchema.parse(
    request.nextUrl.searchParams.get("semesterId")
      ?? request.nextUrl.searchParams.get("sem")
      ?? undefined,
  );
  const rawScheduleType = request.nextUrl.searchParams.get("scheduleType");
  const scheduleType = rawScheduleType ? scheduleTypeSchema.parse(rawScheduleType) : undefined;

  if (courseCode)
  {
    const classes = await getCourseClasses(courseCodeSchema.parse(courseCode), semesterId, scheduleType);
    return NextResponse.json(
      { classes },
      {
        headers: getCacheHeaders(CLASS_RESPONSE_CACHE_CONTROL, CACHE_TAG_GROUPS.classData),
      },
    );
  }

  const decoded = decodeShareUrlState(request.nextUrl.searchParams);
  const timetable = await getTimetableDataFromClassIdentifiers(decoded.selectedClasses, decoded.semesterId);
  return NextResponse.json(
    { timetable },
    {
      headers: getCacheHeaders(CLASS_RESPONSE_CACHE_CONTROL, CACHE_TAG_GROUPS.timetableData),
    },
  );
}
