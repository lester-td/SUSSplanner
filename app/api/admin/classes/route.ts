import { type NextRequest } from "next/server";

import { requireAdminAccess } from "@/lib/auth/admin";
import { errorResponse, json, routeErrorResponse } from "@/lib/api/http";
import { createClass } from "@/lib/db/queries/classes";
import { classCreateSchema } from "@/lib/validation/classes";

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

    const payload = classCreateSchema.parse(await request.json());
    const classRecord = await createClass(payload);
    return json({ class: classRecord }, 201);
  }
  catch (error)
  {
    return routeErrorResponse(error);
  }
}
