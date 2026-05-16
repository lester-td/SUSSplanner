import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { updateSemesterById } from "@/lib/db/queries/semesters";
import { uuidSchema } from "@/lib/validation/common";
import { semesterUpdateSchema } from "@/lib/validation/semesters";

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
    const semesterId = uuidSchema.parse(id);
    const payload = semesterUpdateSchema.parse(await request.json());
    const semester = await updateSemesterById(semesterId, payload);

    if (!semester)
    {
      return errorResponse(404, "Semester not found.");
    }

    return json({ semester });
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
