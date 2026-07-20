import { NextRequest, NextResponse } from "next/server";

import { getSnapshotCacheHeaders } from "@/lib/data/cache";
import {
  getCourseClasses,
  getTimetableDataFromClassIdentifiers,
} from "@/lib/data/queries";
import { decodeShareUrlState } from "@/lib/timetable/share-url";
import {
  courseCodeSchema,
  optionalSemesterIdSchema,
  scheduleTypeSchema,
} from "@/lib/validation/timetable";

export const runtime = "nodejs";

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
        headers: getSnapshotCacheHeaders(),
      },
    );
  }

  const decoded = decodeShareUrlState(request.nextUrl.searchParams);
  const timetable = await getTimetableDataFromClassIdentifiers(decoded.selectedClasses, decoded.semesterId);
  return NextResponse.json(
    { timetable },
    {
      headers: getSnapshotCacheHeaders(),
    },
  );
}
