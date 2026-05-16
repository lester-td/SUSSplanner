import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { deleteModuleById, updateModuleById } from "@/lib/db/queries/modules";
import { uuidSchema } from "@/lib/validation/common";
import { moduleUpdateSchema } from "@/lib/validation/modules";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
)
{
  try
  {
    const admin = await requireAdminAccess();
    if (!admin.ok)
    {
      return errorResponse(admin.status, admin.error);
    }

    const { id } = await context.params;
    const moduleId = uuidSchema.parse(id);
    const payload = moduleUpdateSchema.parse(await request.json());
    const moduleRecord = await updateModuleById(moduleId, payload);

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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
)
{
  try
  {
    const admin = await requireAdminAccess();
    if (!admin.ok)
    {
      return errorResponse(admin.status, admin.error);
    }

    const { id } = await context.params;
    const moduleId = uuidSchema.parse(id);
    const moduleRecord = await deleteModuleById(moduleId);

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
