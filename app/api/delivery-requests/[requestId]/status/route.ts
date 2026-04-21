import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Valid status transitions for delivery requests.
 * Only the traveler who owns the trip can advance statuses.
 */
const STATUS_TRANSITIONS: Record<string, string> = {
  MATCHED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "ARRIVED",
  ARRIVED: "DELIVERED",
};

export async function PATCH(
  request: NextRequest,
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

  // Fetch the delivery request with trip info
  const { data: requestRow, error: fetchError } = await supabase
    .from("delivery_requests")
    .select(
      `
        id,
        status,
        sender_id,
        receiver_id,
        trip_id,
        item_description,
        weight,
        pickup_city,
        dropoff_city,
        trip:trips!inner(traveler_id)
      `,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !requestRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Extract traveler id from the trip relation
  const travelerId = Array.isArray((requestRow as any).trip)
    ? (requestRow as any).trip[0]?.traveler_id
    : (requestRow as any).trip?.traveler_id;

  if (travelerId !== user.id) {
    return NextResponse.json(
      { error: "Only the trip traveler can advance delivery status" },
      { status: 403 },
    );
  }

  const currentStatus = (requestRow as any).status as string;
  const nextStatus = STATUS_TRANSITIONS[currentStatus];

  if (!nextStatus) {
    return NextResponse.json(
      {
        error: `Cannot advance from status "${currentStatus}". ${
          currentStatus === "PENDING"
            ? "Accept the request first."
            : currentStatus === "DELIVERED"
              ? "Delivery is already completed."
              : "No valid transition available."
        }`,
      },
      { status: 400 },
    );
  }

  // Advance the status
  const { data: updated, error: updateError } = await supabase
    .from("delivery_requests")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", currentStatus) // optimistic lock
    .select("id, status")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not advance status" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: updated });
}
