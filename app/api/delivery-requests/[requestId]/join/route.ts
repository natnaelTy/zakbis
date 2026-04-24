import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

  // Get the delivery request
  const { data: requestRow, error: requestError } = await supabase
    .from("delivery_requests")
    .select("id, sender_id, receiver_id, trip:trips!inner(traveler_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Delivery request not found" }, { status: 404 });
  }

  const travelerId = Array.isArray((requestRow as any).trip)
    ? (requestRow as any).trip[0]?.traveler_id
    : (requestRow as any).trip?.traveler_id;

  // Cannot join if user is already a participant
  if (
    requestRow.sender_id === user.id ||
    requestRow.receiver_id === user.id ||
    travelerId === user.id
  ) {
    return NextResponse.json({ data: { message: "Already a participant" } });
  }

  // Determine what role is missing
  let updatePayload = {};
  if (!requestRow.sender_id && !requestRow.receiver_id) {
    return NextResponse.json({ error: "Invalid request state" }, { status: 400 });
  } else if (!requestRow.receiver_id) {
    updatePayload = { receiver_id: user.id };
  } else if (!requestRow.sender_id) {
    updatePayload = { sender_id: user.id };
  } else {
    return NextResponse.json({ error: "This delivery request already has all participants" }, { status: 400 });
  }

  // Update the delivery request
  const { error: updateError } = await supabase
    .from("delivery_requests")
    .update(updatePayload)
    .eq("id", requestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Add them to the chat if it exists
  const { data: chatRow } = await supabase
    .from("chats")
    .select("id")
    .eq("delivery_request_id", requestId)
    .maybeSingle();

  if (chatRow?.id) {
    await supabase.from("chat_participants").upsert({
      chat_id: chatRow.id,
      user_id: user.id,
    }, { onConflict: "chat_id,user_id", ignoreDuplicates: true });
  }

  return NextResponse.json({ data: { success: true } });
}
