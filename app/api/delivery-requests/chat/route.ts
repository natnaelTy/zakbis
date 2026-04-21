import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ensureDeliveryChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deliveryRequestId: string,
  participantIds: string[],
) {
  const { data: existingChat } = await supabase
    .from("chats")
    .select("id")
    .eq("delivery_request_id", deliveryRequestId)
    .maybeSingle();

  let chatId = existingChat?.id;

  if (!chatId) {
    const { data: createdChat, error: chatCreateError } = await supabase
      .from("chats")
      .insert({
        chat_type: "GROUP",
        delivery_request_id: deliveryRequestId,
      })
      .select("id")
      .maybeSingle();

    if (chatCreateError || !createdChat?.id) {
      throw new Error(chatCreateError?.message ?? "Could not create chat");
    }

    chatId = createdChat.id;
  }

  const uniqueParticipants = [...new Set(participantIds.filter(Boolean))];

  if (uniqueParticipants.length > 0) {
    const participantRows = uniqueParticipants.map((participantId) => ({
      chat_id: chatId,
      user_id: participantId,
    }));

    const { error: participantError } = await supabase
      .from("chat_participants")
      .upsert(participantRows, { onConflict: "chat_id,user_id", ignoreDuplicates: true });

    if (participantError) {
      throw new Error(participantError.message);
    }
  }

  return chatId;
}

export async function POST(request: NextRequest) {
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

  const { data: requestRow, error: requestError } = await supabase
    .from("delivery_requests")
    .select(
      `
        id,
        status,
        sender_id,
        receiver_id,
        trip:trips!inner(traveler_id)
      `,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const travelerId = Array.isArray((requestRow as any).trip)
    ? (requestRow as any).trip[0]?.traveler_id
    : (requestRow as any).trip?.traveler_id;

  const senderId = ((requestRow as any).sender_id as string | null) ?? null;
  const receiverId = ((requestRow as any).receiver_id as string | null) ?? null;

  const allowedUsers = [travelerId, senderId, receiverId].filter(Boolean);
  if (!allowedUsers.includes(user.id)) {
    return NextResponse.json({ error: "You cannot access this request chat" }, { status: 403 });
  }

  const status = (requestRow as any).status as string;
  if (!["MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED"].includes(status)) {
    return NextResponse.json({ error: "Chat becomes available after matching" }, { status: 400 });
  }

  try {
    const chatId = await ensureDeliveryChat(supabase, requestId, [travelerId, senderId ?? "", receiverId ?? ""]);
    return NextResponse.json({ data: { chat_id: chatId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create chat" },
      { status: 400 },
    );
  }
}
