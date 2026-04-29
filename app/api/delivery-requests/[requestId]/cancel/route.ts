import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE: Cancel a PENDING delivery request.
 * The sender/receiver owner or the traveler for the trip can cancel while pending.
 */
export async function DELETE(
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

  // Fetch the delivery request
  const { data: row, error: fetchError } = await supabase
    .from("delivery_requests")
    .select("id, status, sender_id, receiver_id, trip:trips!inner(traveler_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const travelerId = Array.isArray((row as any).trip)
    ? (row as any).trip[0]?.traveler_id
    : (row as any).trip?.traveler_id;

  const canCancel = row.sender_id === user.id || row.receiver_id === user.id || travelerId === user.id;
  if (!canCancel) {
    return NextResponse.json({ error: "You cannot cancel this request" }, { status: 403 });
  }

  // Only PENDING requests can be cancelled
  if (row.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot cancel — status is ${row.status}. Only PENDING requests can be cancelled.` },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("delivery_requests")
    .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "PENDING")
    .select("id, status")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not cancel request" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: updated });
}
