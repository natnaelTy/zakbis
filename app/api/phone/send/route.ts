import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeEtPhone } from "@/lib/phone";
import { hashCode, isTestNumber, sendLimit, sendSms, smsMode } from "@/lib/sms";
import { isSameOrigin } from "@/lib/telegram-auth";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Sends a 6-digit code to an Ethiopian mobile. With requestId, the code is for that order's "I'm in Addis". */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const { data: auth } = await (await createClient()).auth.getUser();
  if (!auth.user) return fail("not_allowed", 401);
  const body = (await request.json().catch(() => null)) as { phone?: unknown; requestId?: unknown } | null;
  const phone = normalizeEtPhone(String(body?.phone ?? ""));
  if (!phone) return fail("invalid_phone", 400);
  const mode = smsMode(process.env);
  if (mode === "off") return fail("sms_off", 503);
  if (mode === "test" && !isTestNumber(phone)) return fail("invalid_phone", 400);

  const admin = createAdminClient();
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [mine, toPhone, today] = await Promise.all([
    admin.from("phone_codes").select("created_at").eq("user_id", auth.user.id).gte("created_at", ago(15 * 60_000)),
    admin.from("phone_codes").select("id", { count: "exact", head: true }).eq("phone", phone).gte("created_at", ago(3600_000)),
    admin.from("phone_codes").select("id", { count: "exact", head: true }).gte("created_at", ago(24 * 3600_000)),
  ]);
  if (mine.error || toPhone.error || today.error) return fail("server", 500);
  const limited = sendLimit({ userTimes: mine.data.map((r) => Date.parse(r.created_at)), phoneLastHour: toPhone.count ?? 0, sentToday: today.count ?? 0, now: Date.now() });
  if (limited) return fail(limited, 429);

  const code = mode === "test" ? process.env.ZAKBIS_SMS_TEST_CODE! : String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: insertError } = await admin.from("phone_codes").insert({
    user_id: auth.user.id, phone, code_hash: hashCode(code, auth.user.id),
    request_id: typeof body?.requestId === "string" ? body.requestId : null,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (insertError) return fail("server", 500);
  if (mode === "live" && !(await sendSms(process.env, phone, `Your Zakbis code is ${code}`))) return fail("sms_failed", 502);
  return NextResponse.json({});
}
