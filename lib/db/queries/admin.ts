import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { adminProfiles } from "@/lib/db/schema";

export async function getAdminProfileByUserId(userId: string)
{
  const [adminProfile] = await db
    .select()
    .from(adminProfiles)
    .where(eq(adminProfiles.userId, userId))
    .limit(1);

  return adminProfile ?? null;
}
