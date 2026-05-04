import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("delivery_requests")
    .select(
      `
        id,
        item_description,
        weight,
        pickup_city,
        dropoff_city,
        status,
        created_at,
        updated_at,
        sender_id,
        receiver_id,
        trip_id,
        sender:profiles!delivery_requests_sender_id_fkey(id, full_name, avatar_url, rating, verified),
        receiver:profiles!delivery_requests_receiver_id_fkey(id, full_name, avatar_url, rating, verified),
        trip:trips!delivery_requests_trip_id_fkey(
          id,
          flight_number,
          departure_city,
          destination_city,
          departure_date,
          available_weight,
          price_per_kg,
          status,
          traveler_id,
          traveler:profiles!trips_traveler_id_fkey(id, full_name, avatar_url, rating, verified)
        )
      `,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }

  // Authorization: only participants can view
  const travelerId = Array.isArray((data as any).trip)
    ? (data as any).trip[0]?.traveler_id
    : (data as any).trip?.traveler_id;

  const allowedUsers = [
    (data as any).sender_id,
    (data as any).receiver_id,
    travelerId,
  ].filter(Boolean);

  if (!allowedUsers.includes(user.id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Attach chat_id if one exists for this delivery request
  const { data: chat } = await supabase
    .from("triangular_chats")
    .select("id")
    .eq("delivery_request_id", requestId)
    .maybeSingle();

  return NextResponse.json({
    data: {
      ...data,
      chat_id: chat?.id ?? null,
      current_user_id: user.id,
      is_traveler: user.id === travelerId,
    },
  });
}
