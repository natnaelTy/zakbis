import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DeliveryStatus =
  | "PENDING"
  | "MATCHED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED";

type DeliveryAggregateRow = {
  id: string;
  status: DeliveryStatus;
  weight: number | null;
  trip:
    | {
        price_per_kg: number | null;
      }
    | {
        price_per_kg: number | null;
      }[]
    | null;
};

const ACTIVE_STATUSES = new Set<DeliveryStatus>([
  "MATCHED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
]);

function tripPrice(row: DeliveryAggregateRow) {
  const trip = Array.isArray(row.trip) ? row.trip[0] : row.trip;
  return Number(trip?.price_per_kg ?? 0);
}

function deliveryValue(row: DeliveryAggregateRow) {
  return Number(row.weight ?? 0) * tripPrice(row);
}

function buildStats(rows: DeliveryAggregateRow[]) {
  const pending = rows.filter((row) => row.status === "PENDING").length;
  const active = rows.filter((row) => ACTIVE_STATUSES.has(row.status)).length;
  const delivered = rows.filter((row) => row.status === "DELIVERED").length;
  const cancelled = rows.filter((row) => row.status === "CANCELLED").length;
  const projected = rows
    .filter((row) => row.status !== "CANCELLED")
    .reduce((sum, row) => sum + deliveryValue(row), 0);
  const earned = rows
    .filter((row) => row.status === "DELIVERED")
    .reduce((sum, row) => sum + deliveryValue(row), 0);

  return {
    total: rows.length,
    pending,
    active,
    delivered,
    cancelled,
    projected,
    earned,
  };
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 400 });
  }

  let query = supabase.from("delivery_requests").select(`
    id,
    status,
    weight,
    trip:trips!inner(price_per_kg, traveler_id)
  `);

  if (profile.role === "TRAVELER") {
    query = query.eq("trip.traveler_id", user.id);
  } else if (profile.role === "SENDER") {
    query = query.eq("sender_id", user.id);
  } else if (profile.role === "RECEIVER") {
    query = query.eq("receiver_id", user.id);
  } else {
    return NextResponse.json({ data: buildStats([]) });
  }

  const { data, error } = await query.returns<DeliveryAggregateRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: buildStats(data ?? []) });
}
