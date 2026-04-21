import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function ensureBuyMeChat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  buyMeRequestId: string,
  participantIds: string[],
) {
  const { data: existingChat } = await supabase
    .from("chats")
    .select("id")
    .eq("buy_me_request_id", buyMeRequestId)
    .maybeSingle();

  let chatId = existingChat?.id;

  if (!chatId) {
    const { data: createdChat, error: chatCreateError } = await supabase
      .from("chats")
      .insert({
        chat_type: "DIRECT",
        buy_me_request_id: buyMeRequestId,
      })
      .select("id")
      .maybeSingle();

    if (chatCreateError || !createdChat?.id) {
      throw new Error(chatCreateError?.message ?? "Could not create buy-me chat");
    }

    chatId = createdChat.id;
  }

  const participantRows = [...new Set(participantIds.filter(Boolean))].map((userId) => ({
    chat_id: chatId,
    user_id: userId,
  }));

  if (participantRows.length > 0) {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "TRAVELER") {
    return NextResponse.json({ error: "Only travelers can accept buy-me requests" }, { status: 403 });
  }

  const body = await request.json();
  const requestId = typeof body.requestId === "string" ? body.requestId : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, receiver_id, traveler_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Buy-me request not found" }, { status: 404 });
  }

  if (row.status === "OPEN") {
    const { error: acceptError } = await supabase
      .from("buy_me_requests")
      .update({
        traveler_id: user.id,
        status: "ACCEPTED",
      })
      .eq("id", requestId)
      .eq("status", "OPEN");

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 400 });
    }
  } else if (!(row.status === "ACCEPTED" && row.traveler_id === user.id)) {
    return NextResponse.json({ error: "Request cannot be accepted" }, { status: 400 });
  }

  try {
    const chatId = await ensureBuyMeChat(supabase, requestId, [user.id, row.receiver_id]);
    return NextResponse.json({ data: { request_id: requestId, status: "ACCEPTED", chat_id: chatId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create chat" },
      { status: 400 },
    );
  }
}
