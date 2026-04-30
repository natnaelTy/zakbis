import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client instance using environment variables.
 * This helper is kept for backward compatibility but the default export
 * now provides a ready‑to‑use client instance.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  )
}

/**
 * A singleton Supabase client instance that can be imported throughout the app.
 * Exported as `supabase` to match existing imports.
 */
export const supabase = createClient()
