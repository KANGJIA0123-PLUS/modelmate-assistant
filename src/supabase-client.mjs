import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient(databaseConfig = {}) {
  const supabase = databaseConfig.supabase || {};
  const url = String(supabase.url || "").trim();
  const serviceRoleKey = String(supabase.serviceRoleKey || "").trim();

  if (!url) {
    throw new Error("database.supabase.url is required when database.provider=supabase.");
  }

  if (!serviceRoleKey) {
    throw new Error("database.supabase.serviceRoleKey is required when database.provider=supabase.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
