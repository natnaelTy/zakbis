import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin, verifyTelegramLogin } from "@/lib/telegram-auth";

// Connect Telegram to the signed-in account, so Telegram sign-in opens this same account.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tg = body && verifyTelegramLogin(body, process.env.TELEGRAM_BOT_TOKEN!, Date.now() / 1000);
  if (!tg) return NextResponse.json({ error: "invalid" }, { status: 401 });

  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("telegram_links").select("user_id").eq("telegram_id", tg.id).maybeSingle();
  if (error) return NextResponse.json({ error: "server" }, { status: 500 });
  if (existing) {
    return existing.user_id === user.id
      ? NextResponse.json({ linked: true })
      : NextResponse.json({ error: "taken" }, { status: 409 });
  }

  // The unique user_id column also refuses a second Telegram account on this user.
  const { error: insertError } = await admin.from("telegram_links").insert({ telegram_id: tg.id, user_id: user.id });
  if (insertError) return NextResponse.json({ error: insertError.code === "23505" ? "taken" : "server" }, { status: insertError.code === "23505" ? 409 : 500 });
  await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, telegram_id: tg.id } });
  return NextResponse.json({ linked: true });
}
