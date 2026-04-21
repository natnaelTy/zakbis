import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      profile: {
        fullName: profile?.full_name ?? user.email ?? "User",
        role: profile?.role ?? null,
      },
    },
  });
}
