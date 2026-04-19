import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const rawSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_ID;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL (or project ID) or VITE_SUPABASE_ANON_KEY environment variables"
  );
}

// If user provided only a project ID (no protocol or dot), build the full URL:
// e.g. if rawSupabaseUrl === 'qtltgwkvgaoahafzvsey' -> https://qtltgwkvgaoahafzvsey.supabase.co
const supabaseUrl =
  rawSupabaseUrl.startsWith("http") || rawSupabaseUrl.includes(".")
    ? rawSupabaseUrl
    : `https://${rawSupabaseUrl}.supabase.co`;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
