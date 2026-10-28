import { loadMyVerification } from "@/components/traveler/verification-status";
import { createClient } from "@/lib/supabase/client";
import { verificationState } from "@/lib/account";
import { addisToday, isVisibleToTrip, type Country } from "@/lib/open-requests";
import { receiverPhotoSrc } from "@/lib/photos";
import { postGate, type MyTrip } from "@/lib/trip-post";

export type OpenRequestCard = {
  id: string; item_name: string; quantity: number; item_etb: number; countries: Country[]; needed_by: string; notes: string | null;
  item_url: string | null; screenshot_path: string | null; receiver_id: string; receiverName: string; receiverPhoto: string | null;
};

const toTrip = (t: MyTrip) => ({ originCountry: t.origin_country, arrivalDate: t.arrival_date, shopBy: t.shop_by });

/** The traveler's gate, live trips, and the open requests those trips can serve (optionally one request by id). */
export async function loadTravelerView(only?: string) {
  const supabase = createClient();
  const today = addisToday(new Date());
  const verification = await loadMyVerification();
  if (postGate(verificationState(verification, today)) !== "form") return { verification, ready: false as const };

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const { data: mine } = await supabase.rpc("my_trips");
  const trips = ((mine as MyTrip[] | null) ?? []).filter((t) => t.status === "live" && t.shop_by >= today);

  let q = supabase
    .from("requests")
    .select("id, item_name, quantity, item_etb, countries, needed_by, notes, item_url, screenshot_path, receiver_id")
    .eq("kind", "open")
    .eq("status", "open")
    .gte("needed_by", today)
    .neq("receiver_id", uid ?? "")
    .order("needed_by");
  if (only) q = q.eq("id", only);
  const [{ data: reqs }, { data: offered }] = await Promise.all([q, supabase.from("offers").select("request_id").eq("traveler_id", uid ?? "")]);
  const done = new Set((offered ?? []).map((o) => o.request_id as string));
  const serves = (r: { countries: Country[]; needed_by: string }, t: MyTrip) => isVisibleToTrip({ countries: r.countries, neededBy: r.needed_by }, toTrip(t), today);
  const matching = (reqs ?? []).filter((r) => !done.has(r.id) && trips.some((t) => serves(r as OpenRequestCard, t)));

  const ids = [...new Set(matching.map((r) => r.receiver_id as string))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, first_name, receiver_photo_path").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id as string, p]));
  const photoUrl = (path: string) => supabase.storage.from("receiver-photos").getPublicUrl(path).data.publicUrl;
  const requests: OpenRequestCard[] = matching.map((r) => {
    const p = byId.get(r.receiver_id);
    return { ...(r as Omit<OpenRequestCard, "receiverName" | "receiverPhoto">), receiverName: p?.first_name ?? "Receiver", receiverPhoto: p?.receiver_photo_path ? receiverPhotoSrc(p.receiver_photo_path, photoUrl) : null };
  });
  return { verification, ready: true as const, trips, requests, alreadyOffered: only ? done.has(only) : false, tripsFor: (r: OpenRequestCard) => trips.filter((t) => serves(r, t)) };
}
