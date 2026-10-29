import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashCode } from "@/lib/sms";
import { isSameOrigin } from "@/lib/telegram-auth";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Checks the newest code, confirms the phone in Supabase Auth (where phone_of() reads it), then marks "I'm in Addis" if the code was for an order. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  const { data: auth } = await (await createClient()).auth.getUser();
  if (!auth.user) return fail("not_allowed", 401);
  const uid = auth.user.id;
  const body = (await request.json().catch(() => null)) as { code?: unknown; requestId?: unknown } | null;
  const code = String(body?.code ?? "").trim();
  const requestId = typeof body?.requestId === "string" ? body.requestId : null;

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("phone_codes").select("*").eq("user_id", uid).is("used_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return fail("server", 500);
  if (!row || row.request_id !== requestId || Date.parse(row.expires_at) < Date.now()) return fail("expired", 400);
  if (row.attempts >= 5) return fail("locked", 429);
  // Count the try before comparing, and only if no parallel try counted it first: parallel guesses can't skip the limit.
  const { data: claimed } = await admin.from("phone_codes").update({ attempts: row.attempts + 1 })
    .eq("id", row.id).eq("attempts", row.attempts).is("used_at", null).select("id");
  if (!claimed?.length || hashCode(code, uid) !== row.code_hash) return fail(row.attempts + 1 >= 5 ? "locked" : "wrong_code", 400);
  const { data: used } = await admin.from("phone_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
  if (!used?.length) return fail("expired", 400);

  const { error: phoneError } = await admin.auth.admin.updateUserById(uid, { phone: row.phone, phone_confirm: true });
  if (phoneError) return phoneError.code === "phone_exists" || /already/i.test(phoneError.message) ? fail("phone_in_use", 409) : fail("server", 500);
  if (row.request_id) {
    const { error: addisError } = await admin.rpc("mark_in_addis", { p_request: row.request_id, p_user: uid });
    if (addisError) return fail("not_allowed", 409);
  }
  return NextResponse.json({});
}
