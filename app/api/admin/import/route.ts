import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { importModuleCatalog } from "@/lib/db/queries/imports";
import { importPayloadSchema } from "@/lib/validation/imports";

export const runtime = "nodejs";

export async function POST(request: NextRequest)
{
  try
  {
    const admin = await requireAdminAccess();
    if (!admin.ok)
    {
      return errorResponse(admin.status, admin.error);
    }

    const payload = importPayloadSchema.parse(await request.json());
    const result = await importModuleCatalog(payload);
    return json({ import: result }, 201);
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
