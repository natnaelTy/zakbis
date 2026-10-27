import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { internalEmail, isSameOrigin, verifyTelegramLogin } from "@/lib/telegram-auth";

// Sign in with Telegram. Never attaches to whoever is currently signed in; linking is /api/auth/telegram/link.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tg = body && verifyTelegramLogin(body, process.env.TELEGRAM_BOT_TOKEN!, Date.now() / 1000);
  if (!tg) return NextResponse.json({ error: "invalid" }, { status: 401 });

  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin.from("telegram_links").select("user_id").eq("telegram_id", tg.id).maybeSingle();
  if (linkError) return NextResponse.json({ error: "server" }, { status: 500 });

  let userId = link?.user_id as string | undefined;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: internalEmail(),
      email_confirm: true,
      app_metadata: { telegram_id: tg.id },
    });
    if (error || !created.user) return NextResponse.json({ error: "server" }, { status: 500 });
    userId = created.user.id;
    const { error: insertError } = await admin.from("telegram_links").insert({ telegram_id: tg.id, user_id: userId });
    if (insertError) {
      // Another first sign-in for this Telegram id won the race: drop ours and use theirs. Never adopt a user found by email.
      await admin.auth.admin.deleteUser(userId);
      if (insertError.code !== "23505") return NextResponse.json({ error: "server" }, { status: 500 });
      const { data: winner } = await admin.from("telegram_links").select("user_id").eq("telegram_id", tg.id).maybeSingle();
      if (!winner) return NextResponse.json({ error: "server" }, { status: 500 });
      userId = winner.user_id as string;
    }
  }

  // The account may have swapped its internal address for a real email (linking), so sign in by its current email.
  const { data: found, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !found.user?.email) return NextResponse.json({ error: "server" }, { status: 500 });
  const { data: magic, error: linkGenError } = await admin.auth.admin.generateLink({ type: "magiclink", email: found.user.email });
  if (linkGenError) return NextResponse.json({ error: "server" }, { status: 500 });

  const supabase = await createClient();
  const { error: sessionError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: magic.properties.hashed_token });
  if (sessionError) return NextResponse.json({ error: "server" }, { status: 500 });

  const { data: profile } = await supabase.from("profiles").select("first_name, active_side").eq("id", userId).maybeSingle();
  return NextResponse.json({ hasSide: !!profile?.active_side, firstName: profile?.first_name ?? tg.first_name });
}
