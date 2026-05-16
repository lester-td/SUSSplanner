import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { createSemester } from "@/lib/db/queries/semesters";
import { semesterCreateSchema } from "@/lib/validation/semesters";

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

    const payload = semesterCreateSchema.parse(await request.json());
    const semester = await createSemester(payload);
    return json({ semester }, 201);
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
