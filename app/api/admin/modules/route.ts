import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { createModule } from "@/lib/db/queries/modules";
import { moduleCreateSchema } from "@/lib/validation/modules";

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

    const payload = moduleCreateSchema.parse(await request.json());
    const moduleRecord = await createModule(payload);
    return json({ module: moduleRecord }, 201);
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
