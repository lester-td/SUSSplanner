import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { deleteClassById, updateClassById } from "@/lib/db/queries/classes";
import { uuidSchema } from "@/lib/validation/common";
import { classUpdateSchema } from "@/lib/validation/classes";

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
    const classId = uuidSchema.parse(id);
    const payload = classUpdateSchema.parse(await request.json());
    const classRecord = await updateClassById(classId, payload);

    if (!classRecord)
    {
      return errorResponse(404, "Class not found.");
    }

    return json({ class: classRecord });
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
    const classId = uuidSchema.parse(id);
    const classRecord = await deleteClassById(classId);

    if (!classRecord)
    {
      return errorResponse(404, "Class not found.");
    }

    return json({ class: classRecord });
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
