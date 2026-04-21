import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const date = searchParams.get("date")?.trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "20") || 20, 50);

  let query = supabase
    .from("trips")
    .select(
      `
        id,
        flight_number,
        departure_city,
        destination_city,
        departure_date,
        available_weight,
        price_per_kg,
        profiles (
          full_name,
          rating,
          verified
        )
      `,
    )
    .eq("status", "OPEN")
    .eq("trip_type", "TRIANGULAR");

  if (from && from !== "__any__") {
    query = query.ilike("departure_city", `%${from}%`);
  }

  if (to && to !== "__any__") {
    query = query.ilike("destination_city", `%${to}%`);
  }

  if (date) {
    query = query.eq("departure_date", date);
  }

  const { data, error } = await query.order("departure_date", { ascending: true }).limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "TRAVELER") {
    return NextResponse.json({ error: "Only travelers can create trips" }, { status: 403 });
  }

  const body = await request.json();

  const tripType = body.trip_type === "BUY_ME" ? "BUY_ME" : "TRIANGULAR";
  const flightNumber = typeof body.flight_number === "string" ? body.flight_number.trim().toUpperCase() : "";
  const departureCity = typeof body.departure_city === "string" ? body.departure_city.trim() : "";
  const destinationCity = typeof body.destination_city === "string" ? body.destination_city.trim() : "";
  const departureDate = typeof body.departure_date === "string" ? body.departure_date : "";
  const availableWeight = Number(body.available_weight);
  const pricePerKg = Number(body.price_per_kg);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (
    !flightNumber ||
    !departureCity ||
    !destinationCity ||
    !departureDate ||
    !Number.isFinite(availableWeight) ||
    availableWeight <= 0 ||
    !Number.isFinite(pricePerKg) ||
    pricePerKg < 0
  ) {
    return NextResponse.json({ error: "Invalid trip payload" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("trips")
    .insert({
      traveler_id: user.id,
      trip_type: tripType,
      flight_number: flightNumber,
      departure_city: departureCity,
      destination_city: destinationCity,
      departure_date: departureDate,
      available_weight: availableWeight,
      price_per_kg: pricePerKg,
      notes: notes || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
