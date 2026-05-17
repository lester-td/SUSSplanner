import { type NextRequest } from "next/server";
import { z } from "zod";

import { json, optionsResponse, routeErrorResponse } from "@/lib/api/http";
import { getPublicClasses } from "@/lib/db/queries/classes";
import { moduleCodeSchema, uuidSchema } from "@/lib/validation/common";

export const runtime = "nodejs";

const querySchema = z.object({
  moduleCode: moduleCodeSchema.optional(),
  semesterId: uuidSchema.optional(),
  offeringId: uuidSchema.optional(),
  activeOnly: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest)
{
  try
  {
    const parsed = querySchema.parse({
      moduleCode: request.nextUrl.searchParams.get("moduleCode") ?? undefined,
      semesterId: request.nextUrl.searchParams.get("semesterId") ?? undefined,
      offeringId: request.nextUrl.searchParams.get("offeringId") ?? undefined,
      activeOnly:
        request.nextUrl.searchParams.get("activeOnly") === null
          ? true
          : request.nextUrl.searchParams.get("activeOnly") !== "false",
    });

    const classes = await getPublicClasses(parsed);
    return json({ classes }, 200, request);
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
