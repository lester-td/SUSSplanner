import { NextRequest } from "next/server";

import { buildIcs } from "@/lib/export/ics";
import { getTimetableDataFromClassIdentifiers } from "@/lib/data/queries";
import { decodeShareUrlState } from "@/lib/timetable/share-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const decoded = decodeShareUrlState(request.nextUrl.searchParams);
  const timetable = await getTimetableDataFromClassIdentifiers(decoded.selectedClasses, decoded.semesterId);
  const ics = buildIcs(timetable.semester, timetable.events);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="suss-planner-${decoded.semesterId}.ics"`,
    },
  });
}
