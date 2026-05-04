import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the delivery request
  const { data: requestRow, error: requestError } = await adminSupabase
    .from("delivery_requests")
    .select("id, sender_id, receiver_id, trip:trips!delivery_requests_trip_id_fkey(traveler_id)")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Delivery request not found" }, { status: 404 });
  }

  const travelerId = Array.isArray((requestRow as any).trip)
    ? (requestRow as any).trip[0]?.traveler_id
    : (requestRow as any).trip?.traveler_id;

  const existingSenderId = (requestRow as any).sender_id as string | null;
  const existingReceiverId = (requestRow as any).receiver_id as string | null;

  // Cannot join if user is already a participant
  if (existingSenderId === user.id || existingReceiverId === user.id || travelerId === user.id) {
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
  const { error: updateError } = await adminSupabase
    .from("delivery_requests")
    .update(updatePayload)
    .eq("id", requestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const joinedSenderId = existingSenderId ?? (updatePayload as { sender_id?: string }).sender_id ?? null;
  const joinedReceiverId = existingReceiverId ?? (updatePayload as { receiver_id?: string }).receiver_id ?? null;

  // Keep the triangular chat row in sync with the request participants.
  const { data: chatRow } = await adminSupabase
    .from("triangular_chats")
    .select("id")
    .eq("delivery_request_id", requestId)
    .maybeSingle();

  let chatId: string | null = chatRow?.id ?? null;

  if (joinedSenderId && joinedReceiverId && travelerId) {
    const chatPayload = {
      delivery_request_id: requestId,
      sender_id: joinedSenderId,
      traveler_id: travelerId,
      receiver_id: joinedReceiverId,
    };

    if (chatRow?.id) {
      await adminSupabase
        .from("triangular_chats")
        .update(chatPayload)
        .eq("id", chatRow.id);
      chatId = chatRow.id;
    } else {
      const { data: createdChat } = await adminSupabase
        .from("triangular_chats")
        .insert(chatPayload)
        .select("id")
        .maybeSingle();

      chatId = createdChat?.id ?? null;
    }
  }

  return NextResponse.json({ data: { success: true, chat_id: chatId } });
}
