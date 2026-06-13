import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const emailSchema = z.string().email();

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const email = typeof body.email === "string" ? body.email.trim() : "";

  try {
    emailSchema.parse(email);
  } catch (err) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      user_metadata: {
        role: "TRAVELER",
      },
      email_confirm: false,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: { ok: true, user: data?.user ?? null } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
