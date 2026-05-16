import { type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { getPublicModuleByCode } from "@/lib/db/queries/modules";
import { uuidSchema } from "@/lib/validation/common";

export const runtime = "nodejs";

const querySchema = z.object({
  semesterId: uuidSchema.optional(),
  activeOnly: z.boolean().optional().default(true),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
)
{
  try
  {
    const { code } = await context.params;
    const parsed = querySchema.parse({
      semesterId: request.nextUrl.searchParams.get("semesterId") ?? undefined,
      activeOnly:
        request.nextUrl.searchParams.get("activeOnly") === null
          ? true
          : request.nextUrl.searchParams.get("activeOnly") !== "false",
    });

    const moduleRecord = await getPublicModuleByCode(code, parsed);
    if (!moduleRecord)
    {
      return errorResponse(404, "Module not found.");
    }

    return json({ module: moduleRecord });
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
