import { NextRequest, NextResponse } from "next/server";
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

async function ensureChatAccess(chatId: string) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, adminSupabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: triangularChat } = await adminSupabase
    .from("triangular_chats")
    .select("id, delivery_request_id, sender_id, traveler_id, receiver_id")
    .eq("id", chatId)
    .maybeSingle();

  if (triangularChat) {
    const { data: deliveryData } = await adminSupabase
      .from("delivery_requests")
      .select("sender_id, receiver_id, trip:trips!delivery_requests_trip_id_fkey(traveler_id)")
      .eq("id", triangularChat.delivery_request_id)
      .maybeSingle();

    const trip = (deliveryData as { trip?: { traveler_id?: string } | Array<{ traveler_id?: string }> } | null)?.trip;
    const travelerId = Array.isArray(trip) ? trip[0]?.traveler_id ?? null : trip?.traveler_id ?? null;

    const isAllowed = deliveryData
      ? [deliveryData.sender_id, deliveryData.receiver_id, travelerId].includes(user.id)
      : false;

    if (!isAllowed) {
      return { supabase, adminSupabase, user, participants: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }

    return {
      supabase,
      adminSupabase,
      user,
      participants: {
        senderId: triangularChat.sender_id,
        travelerId,
        receiverId: triangularChat.receiver_id,
      },
      error: null as NextResponse<unknown> | null,
    };
  }

  const { data: shoppingChat } = await adminSupabase
    .from("shopping_chats")
    .select("id, buy_me_request_id, traveler_id, receiver_id")
    .eq("id", chatId)
    .maybeSingle();

  if (!shoppingChat) {
    return { supabase, adminSupabase, user, error: NextResponse.json({ error: "Chat not found" }, { status: 404 }) };
  }

  const { data: buyMeData } = await adminSupabase
    .from("buy_me_requests")
    .select("receiver_id, traveler_id")
    .eq("id", shoppingChat.buy_me_request_id)
    .maybeSingle();

  if (!buyMeData) {
    return { supabase, adminSupabase, user, participants: null, error: NextResponse.json({ error: "Chat not found" }, { status: 404 }) };
  }

  const isAllowed = buyMeData
    ? [buyMeData.receiver_id, buyMeData.traveler_id].includes(user.id)
    : false;

  if (!isAllowed) {
    return { supabase, adminSupabase, user, participants: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, adminSupabase, user, participants: { travelerId: buyMeData.traveler_id, receiverId: buyMeData.receiver_id }, error: null as NextResponse<unknown> | null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { chatId } = await context.params;
  const { adminSupabase, user, participants, error: accessError } = await ensureChatAccess(chatId);

  if (accessError || !user) {
    return accessError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await adminSupabase
    .from("messages")
    .select(`
      id,
      chat_id,
      sender_id,
      text,
      created_at,
      profiles!inner(full_name, avatar_url)
    `)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const messages = (data ?? []).map((row: any) => ({
    id: row.id,
    chat_id: row.chat_id,
    sender_id: row.sender_id,
    text: row.text,
    created_at: row.created_at,
    sender: {
      full_name: row.profiles?.full_name ?? "Unknown",
      avatar_url: row.profiles?.avatar_url ?? null,
    },
  }));

  return NextResponse.json({ data: messages, currentUserId: user.id, participants });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { chatId } = await context.params;
  const { supabase, user, error: accessError } = await ensureChatAccess(chatId);

  if (accessError || !user) {
    return accessError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: user.id,
      text,
    })
    .select("id, chat_id, sender_id, text, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
