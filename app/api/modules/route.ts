import { type NextRequest } from "next/server";
import { z } from "zod";

import { json, optionsResponse, routeErrorResponse } from "@/lib/api/http";
import { listPublicModules } from "@/lib/db/queries/modules";
import { uuidSchema } from "@/lib/validation/common";

export const runtime = "nodejs";

const querySchema = z.object({
  semesterId: uuidSchema.optional(),
  activeOnly: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest)
{
  try
  {
    const parsed = querySchema.parse({
      semesterId: request.nextUrl.searchParams.get("semesterId") ?? undefined,
      activeOnly:
        request.nextUrl.searchParams.get("activeOnly") === null
          ? true
          : request.nextUrl.searchParams.get("activeOnly") !== "false",
    });

    const modules = await listPublicModules(parsed);
    return json({ modules }, 200, request);
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
