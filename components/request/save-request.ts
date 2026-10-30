import { createClient } from "@/lib/supabase/client";
import { normalizeUrl } from "@/lib/money";
import { CONTACT_ERROR } from "@/lib/negotiation";
import type { ItemFieldsState } from "./item-fields";

type Where = { kind: "trip"; trip_id: string } | { kind: "open"; countries: string[]; needed_by: string };

/** Uploads the screenshot (if any) and saves the request; the database sets status, receiver, rate and deadlines. */
export async function saveRequest(f: ItemFieldsState, where: Where): Promise<{ id: string } | { error: string }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please sign in again." };

  let screenshot_path: string | null = null;
  if (f.file) {
    const ext = f.file.name.split(".").pop()?.toLowerCase() || "jpg";
    screenshot_path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("screenshots").upload(screenshot_path, f.file, { contentType: f.file.type });
    if (up.error) return { error: "Couldn't upload the screenshot. Please try again." };
  }

  const { data, error } = await supabase
    .from("requests")
    .insert({
      ...where,
      item_name: f.item.trim(),
      item_url: f.link.trim() ? normalizeUrl(f.link) : null,
      screenshot_path,
      quantity: f.qty,
      notes: f.notes.trim() || null,
      unit_price: f.unitPrice,
      currency: f.currency,
    })
    .select("id")
    .single();
  if (error || !data) {
    const m = error?.message ?? "";
    if (m.includes("please remove")) return { error: CONTACT_ERROR };
    if (m.includes("can't make new requests")) return { error: "Your account can't make new requests. Contact support." };
    if (m.includes("trip is not available")) return { error: "This trip is no longer taking requests." };
    return { error: "Couldn't send. Please try again." };
  }
  return { id: data.id as string };
}
