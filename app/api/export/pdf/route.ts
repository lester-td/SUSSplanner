import { NextRequest } from "next/server";

import { getTimetableDataFromClassIdentifiers } from "@/lib/data/timetable";
import { buildTimetablePdf } from "@/lib/export/pdf";
import { decodeShareUrlState } from "@/lib/timetable/share-url";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  const decoded = decodeShareUrlState(request.nextUrl.searchParams);
  const timetable = await getTimetableDataFromClassIdentifiers(decoded.selectedClasses, decoded.semesterId);
  const pdf = await buildTimetablePdf(timetable.semester, timetable.events, timetable.clashes);

  return new Response(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="suss-planner-${decoded.semesterId}.pdf"`,
    },
  });
}
