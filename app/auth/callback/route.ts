import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-email";

// Return point for OAuth redirects (Profile → Connect Google). Exchanges the one-time code for the session.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
