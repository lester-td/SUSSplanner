import { json, routeErrorResponse } from "@/lib/api/http";
import { getActiveSemester } from "@/lib/db/queries/semesters";

export const runtime = "nodejs";

export async function GET()
{
  try
  {
    const semester = await getActiveSemester();
    return json({ semester: semester ?? null });
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
