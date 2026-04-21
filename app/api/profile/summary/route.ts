import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  departure_city: string;
  destination_city: string;
  departure_date: string;
  status: string;
};

type DeliveryRow = {
  id: string;
  pickup_city: string;
  dropoff_city: string;
  status: string;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, rating, verified, phone, created_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { count: chatCount } = await supabase
    .from("chats")
    .select("*", { count: "exact", head: true })
    .limit(1);

  const { count: tripCount } = await supabase
    .from("trips")
    .select("*", { count: "exact", head: true })
    .eq("traveler_id", user.id);

  const { count: sentCount } = await supabase
    .from("delivery_requests")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", user.id);

  const { count: receivedCount } = await supabase
    .from("delivery_requests")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", user.id);

  const { count: buyMeReceiverCount } = await supabase
    .from("buy_me_requests")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", user.id);

  const { count: buyMeTravelerCount } = await supabase
    .from("buy_me_requests")
    .select("*", { count: "exact", head: true })
    .eq("traveler_id", user.id);

  const { data: recentTrips } = await supabase
    .from("trips")
    .select("id, departure_city, destination_city, departure_date, status")
    .eq("traveler_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<TripRow[]>();

  const { data: recentDeliveries } = await supabase
    .from("delivery_requests")
    .select("id, pickup_city, dropoff_city, status, created_at")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(3)
    .returns<DeliveryRow[]>();

  return NextResponse.json({
    data: {
      profile,
      chatCount: chatCount ?? 0,
      tripCount: tripCount ?? 0,
      sentCount: sentCount ?? 0,
      receivedCount: receivedCount ?? 0,
      buyMeReceiverCount: buyMeReceiverCount ?? 0,
      buyMeTravelerCount: buyMeTravelerCount ?? 0,
      recentTrips: recentTrips ?? [],
      recentDeliveries: recentDeliveries ?? [],
    },
  });
}
