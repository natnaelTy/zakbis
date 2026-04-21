import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { chatId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: chatData, error: chatError } = await supabase
    .from("chats")
    .select("id, chat_type, delivery_request_id, buy_me_request_id")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chatData) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  let deliveryStatus: string | null = null;
  let buyMeStatus: string | null = null;

  if (chatData.delivery_request_id) {
    const { data: deliveryData } = await supabase
      .from("delivery_requests")
      .select("status")
      .eq("id", chatData.delivery_request_id)
      .maybeSingle();

    deliveryStatus = deliveryData?.status?.toLowerCase?.() ?? null;
  }

  if (chatData.buy_me_request_id) {
    const { data: buyMeData } = await supabase
      .from("buy_me_requests")
      .select("status")
      .eq("id", chatData.buy_me_request_id)
      .maybeSingle();

    buyMeStatus = buyMeData?.status?.toLowerCase?.() ?? null;
  }

  return NextResponse.json({
    data: {
      id: chatData.id,
      chatType: chatData.chat_type,
      deliveryRequestId: chatData.delivery_request_id,
      buyMeRequestId: chatData.buy_me_request_id,
      deliveryStatus,
      buyMeStatus,
    },
  });
}
