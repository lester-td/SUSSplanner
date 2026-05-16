import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminProfileByUserId } from "@/lib/db/queries/admin";

export async function requireAdminAccess()
{
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims)
  {
    return {
      ok: false as const,
      status: 401,
      error: "Admin authentication required.",
    };
  }

  const userId = String(data.claims.sub ?? "");
  if (!userId)
  {
    return {
      ok: false as const,
      status: 401,
      error: "Authenticated user id is missing.",
    };
  }

  const adminProfile = await getAdminProfileByUserId(userId);
  if (!adminProfile)
  {
    return {
      ok: false as const,
      status: 403,
      error: "Authenticated user is not an admin.",
    };
  }

  return {
    ok: true as const,
    adminProfile,
    userId,
    email:
      typeof data.claims.email === "string"
        ? data.claims.email
        : adminProfile.email,
  };
}
