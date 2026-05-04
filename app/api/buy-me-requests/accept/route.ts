import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Ensure a shopping chat exists for a buy-me request.
async function ensureShoppingChat(
  adminSupabase: ReturnType<typeof createAdminClient>,
  buyMeRequestId: string,
  travelerId: string,
  receiverId: string,
) {
  const { data: existingChat } = await adminSupabase
    .from("shopping_chats")
    .select("id")
    .eq("buy_me_request_id", buyMeRequestId)
    .maybeSingle();

  if (existingChat?.id) {
    const { error } = await adminSupabase
      .from("shopping_chats")
      .update({ traveler_id: travelerId, receiver_id: receiverId })
      .eq("id", existingChat.id);

    if (error) {
      throw new Error(error.message);
    }

    return existingChat.id;
  }

  const { data: createdChat, error: chatCreateError } = await adminSupabase
    .from("shopping_chats")
    .insert({
      buy_me_request_id: buyMeRequestId,
      traveler_id: travelerId,
      receiver_id: receiverId,
    })
    .select("id")
    .maybeSingle();

  if (chatCreateError || !createdChat?.id) {
    throw new Error(chatCreateError?.message ?? "Could not create buy-me chat");
  }

  return createdChat.id;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
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

  const { data: row, error: rowError } = await adminSupabase
    .from("buy_me_requests")
    .select("id, status, receiver_id, traveler_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Buy-me request not found" }, { status: 404 });
  }

  if (row.status === "OPEN") {
    const { error: acceptError } = await adminSupabase
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
    const chatId = await ensureShoppingChat(
      adminSupabase,
      requestId,
      user.id,
      row.receiver_id,
    );
    return NextResponse.json({ data: { request_id: requestId, status: "ACCEPTED", chat_id: chatId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create chat" },
      { status: 400 },
    );
  }
}
