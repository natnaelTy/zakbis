import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client‑side Supabase instance that uses the **public anon key**.
 * This is safe to import in React client components (e.g., layout.tsx).
 */
export const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
