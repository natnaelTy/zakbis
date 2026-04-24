import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const destination = searchParams.get("destination")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "50") || 50, 100);

  let query = supabase
    .from("buy_me_requests")
    .select(
      `
        id,
        receiver_id,
        traveler_id,
        trip_id,
        product_url,
        product_name,
        product_image,
        estimated_price,
        destination,
        notes,
        status,
        created_at
      `,
    )
    .eq("status", "OPEN");

  if (destination && destination !== "__any__") {
    query = query.ilike("destination", `%${destination}%`);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = data ?? [];
  const receiverIds = [...new Set(rows.map((row) => row.receiver_id))];

  if (receiverIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const { data: receivers } = await supabase
    .from("profiles")
    .select("id, full_name, verified, rating")
    .in("id", receiverIds);

  const byId = new Map((receivers ?? []).map((receiver: any) => [receiver.id, receiver]));

  const mapped = rows.map((row) => ({
    ...row,
    receiver: byId.get(row.receiver_id) ?? { full_name: "Receiver", verified: false, rating: 0 },
  }));

  return NextResponse.json({ data: mapped });
}
