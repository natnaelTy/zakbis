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
