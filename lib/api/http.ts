import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json(payload: unknown, status = 200)
{
  return NextResponse.json(payload, { status });
}

export function errorResponse(status: number, error: string, details?: unknown)
{
  return NextResponse.json(
    details ? { error, details } : { error },
    { status }
  );
}

export function zodErrorResponse(error: ZodError)
{
  return errorResponse(400, "Validation failed.", error.flatten());
}

export function routeErrorResponse(error: unknown)
{
  if (error instanceof ZodError)
  {
    return zodErrorResponse(error);
  }

  if (typeof error === "object" && error && "code" in error)
  {
    const code = String(error.code);
    if (code === "23505")
    {
      return errorResponse(409, "A record with the same unique key already exists.");
    }

    if (code === "23503")
    {
      return errorResponse(400, "A referenced record could not be found.");
    }
  }

  if (error instanceof Error)
  {
    return errorResponse(500, error.message);
  }

  return errorResponse(500, "Unexpected server error.");
}
