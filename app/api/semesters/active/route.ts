import { type NextRequest } from "next/server";

import { json, optionsResponse, routeErrorResponse } from "@/lib/api/http";
import { getActiveSemester } from "@/lib/db/queries/semesters";

export const runtime = "nodejs";

export async function GET(request: NextRequest)
{
  try
  {
    const semester = await getActiveSemester();
    return json({ semester: semester ?? null }, 200, request);
  }
  catch (error)
  {
    return routeErrorResponse(error, request);
  }
}

export function OPTIONS(request: NextRequest)
{
  return optionsResponse(request);
}
