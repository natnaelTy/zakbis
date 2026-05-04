import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatParticipant = {
  full_name: string;
  avatar_url: string | null;
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [triangularResult, shoppingResult] = await Promise.all([
    supabase
      .from("triangular_chats")
      .select(
        `
          id,
          delivery_request_id,
          created_at,
          sender:profiles!triangular_chats_sender_id_fkey(full_name, avatar_url),
          traveler:profiles!triangular_chats_traveler_id_fkey(full_name, avatar_url),
          receiver:profiles!triangular_chats_receiver_id_fkey(full_name, avatar_url)
        `,
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("shopping_chats")
      .select(
        `
          id,
          buy_me_request_id,
          created_at,
          traveler:profiles!shopping_chats_traveler_id_fkey(full_name, avatar_url),
          receiver:profiles!shopping_chats_receiver_id_fkey(full_name, avatar_url)
        `,
      )
      .order("created_at", { ascending: false }),
  ]);

  if (triangularResult.error) {
    return NextResponse.json({ error: triangularResult.error.message }, { status: 400 });
  }

  if (shoppingResult.error) {
    return NextResponse.json({ error: shoppingResult.error.message }, { status: 400 });
  }

  const chatEntries = [
    ...((triangularResult.data ?? []).map((chat: any) => ({
      id: chat.id,
      chatType: "GROUP" as const,
      deliveryRequestId: chat.delivery_request_id,
      buyMeRequestId: null,
      created_at: chat.created_at,
      participants: [chat.sender, chat.traveler, chat.receiver] as ChatParticipant[],
    }))),
    ...((shoppingResult.data ?? []).map((chat: any) => ({
      id: chat.id,
      chatType: "DIRECT" as const,
      deliveryRequestId: null,
      buyMeRequestId: chat.buy_me_request_id,
      created_at: chat.created_at,
      participants: [chat.traveler, chat.receiver] as ChatParticipant[],
    }))),
  ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const chatList = await Promise.all(
    chatEntries.map(async (chat) => {
      const { data: lastMessage } = await supabase
        .from("messages")
        .select("text, created_at")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const participants = (chat.participants ?? [])
        .filter((participant) => participant?.full_name)
        .map((participant) => ({
          full_name: participant.full_name,
          avatar_url: participant.avatar_url ?? null,
        }));

      return {
        id: chat.id,
        chatType: chat.chatType,
        deliveryRequestId: chat.deliveryRequestId,
        buyMeRequestId: chat.buyMeRequestId,
        lastMessageText: lastMessage?.text ?? "No messages yet",
        lastMessageTime: lastMessage?.created_at ?? chat.created_at,
        participants,
      };
    }),
  );

  return NextResponse.json({ data: chatList });
}
