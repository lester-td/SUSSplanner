import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getRequiredEnv(name: string)
{
  const value = process.env[name];
  if (!value)
  {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createSupabaseServerClient()
{
  const cookieStore = await cookies();

  return createServerClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll()
        {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet)
        {
          try
          {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          }
          catch {
            // Route handlers can ignore cookie write failures when no refresh is needed.
          }
        },
      },
    }
  );
}
