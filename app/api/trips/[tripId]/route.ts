import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const supabase = await createClient();
  const { tripId } = await params;

  const { data, error } = await supabase
    .from("trips")
    .select(
      `
        id,
        traveler_id,
        flight_number,
        departure_city,
        destination_city,
        departure_date,
        available_weight,
        price_per_kg,
        notes,
        profiles (
          full_name,
          rating,
          verified
        )
      `,
    )
    .eq("id", tripId)
    .eq("trip_type", "TRIANGULAR")
    .eq("status", "OPEN")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const supabase = await createClient();
  const { tripId } = await params;
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure user owns trip
  const { data: trip } = await supabase
    .from("trips")
    .select("traveler_id")
    .eq("id", tripId)
    .single();

  if (!trip || trip.traveler_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("trips")
    .delete()
    .eq("id", tripId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: { success: true } });
}
