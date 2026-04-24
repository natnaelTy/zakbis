import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST: Traveler uploads a receipt URL to confirm a purchase.
 * Also advances buy_me_request status from ACCEPTED → PURCHASED.
 *
 * PATCH: Advance buy_me_request status:
 *   PURCHASED → DELIVERED (traveler confirms delivery)
 */

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
    return NextResponse.json({ error: "Only travelers can upload receipts" }, { status: 403 });
  }

  const body = await request.json();
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  if (!receiptUrl) {
    return NextResponse.json({ error: "receiptUrl is required" }, { status: 400 });
  }

  // Verify the request exists, is ACCEPTED, and belongs to this traveler
  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, traveler_id, receiver_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.traveler_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned traveler" }, { status: 403 });
  }

  if (row.status !== "ACCEPTED") {
    return NextResponse.json(
      { error: `Cannot upload receipt — current status is ${row.status}` },
      { status: 400 },
    );
  }

  // Update the request with receipt and advance status
  const { data: updated, error: updateError } = await supabase
    .from("buy_me_requests")
    .update({
      receipt_url: receiptUrl,
      status: "PURCHASED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "ACCEPTED") // optimistic lock
    .select("id, status, receipt_url")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update request" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: updated });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const requestId = typeof body.requestId === "string" ? body.requestId : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, traveler_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.traveler_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned traveler" }, { status: 403 });
  }

  // Valid transitions: PURCHASED → DELIVERED
  if (row.status !== "PURCHASED") {
    return NextResponse.json(
      { error: `Cannot advance — current status is ${row.status}` },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("buy_me_requests")
    .update({
      status: "DELIVERED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "PURCHASED")
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
