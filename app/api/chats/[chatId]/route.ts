import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

function getTravelerIdFromDelivery(deliveryData: unknown): string | null {
  const trip = (deliveryData as { trip?: { traveler_id?: string } | Array<{ traveler_id?: string }> } | null)?.trip;

  if (Array.isArray(trip)) {
    return trip[0]?.traveler_id ?? null;
  }

  return trip?.traveler_id ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { chatId } = await context.params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: triangularChat, error: triangularError } = await adminSupabase
    .from("triangular_chats")
    .select("id, delivery_request_id, sender_id, traveler_id, receiver_id")
    .eq("id", chatId)
    .maybeSingle();

  const { data: shoppingChat, error: shoppingError } = await adminSupabase
    .from("shopping_chats")
    .select("id, buy_me_request_id, traveler_id, receiver_id")
    .eq("id", chatId)
    .maybeSingle();

  if (triangularError || shoppingError) {
    return NextResponse.json({ error: triangularError?.message ?? shoppingError?.message ?? "Chat not found" }, { status: 404 });
  }

  const chatData = triangularChat
    ? {
        id: triangularChat.id,
        chat_type: "GROUP" as const,
        delivery_request_id: triangularChat.delivery_request_id,
        buy_me_request_id: null,
      }
    : shoppingChat
      ? {
          id: shoppingChat.id,
          chat_type: "DIRECT" as const,
          delivery_request_id: null,
          buy_me_request_id: shoppingChat.buy_me_request_id,
        }
      : null;

  if (!chatData) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  let isAllowed = false;

  if (chatData.buy_me_request_id) {
    const { data: buyMeData } = await adminSupabase
      .from("buy_me_requests")
      .select("receiver_id, traveler_id")
      .eq("id", chatData.buy_me_request_id)
      .maybeSingle();

    isAllowed = buyMeData
      ? [buyMeData.receiver_id, buyMeData.traveler_id].includes(user.id)
      : false;
  } else if (chatData.delivery_request_id) {
    const { data: deliveryData } = await adminSupabase
      .from("delivery_requests")
      .select("sender_id, receiver_id, trip:trips!delivery_requests_trip_id_fkey(traveler_id)")
      .eq("id", chatData.delivery_request_id)
      .maybeSingle();

    const travelerId = getTravelerIdFromDelivery(deliveryData);

    isAllowed = deliveryData ? [deliveryData.sender_id, deliveryData.receiver_id, travelerId].includes(user.id) : false;
  }

  if (!isAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
