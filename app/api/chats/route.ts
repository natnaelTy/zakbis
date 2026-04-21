import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatRow = {
  id: string;
  chat_type: "GROUP" | "DIRECT";
  delivery_request_id: string | null;
  buy_me_request_id: string | null;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: chatsData, error: chatsError } = await supabase
    .from("chats")
    .select("id, chat_type, delivery_request_id, buy_me_request_id, created_at")
    .order("created_at", { ascending: false });

  if (chatsError) {
    return NextResponse.json({ error: chatsError.message }, { status: 400 });
  }

  const chats = (chatsData as ChatRow[]) ?? [];

  const chatList = await Promise.all(
    chats.map(async (chat) => {
      const [{ data: lastMessage }, { data: participantRows }] = await Promise.all([
        supabase
          .from("messages")
          .select("text, created_at")
          .eq("chat_id", chat.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("chat_participants")
          .select("user_id, profiles!inner(full_name, avatar_url)")
          .eq("chat_id", chat.id),
      ]);

      const participants = (participantRows ?? [])
        .filter((row: any) => row.user_id !== user.id)
        .map((row: any) => ({
          full_name: row.profiles?.full_name ?? "User",
          avatar_url: row.profiles?.avatar_url ?? null,
        }));

      return {
        id: chat.id,
        chatType: chat.chat_type,
        deliveryRequestId: chat.delivery_request_id,
        buyMeRequestId: chat.buy_me_request_id,
        lastMessageText: lastMessage?.text ?? "No messages yet",
        lastMessageTime: lastMessage?.created_at ?? chat.created_at,
        participants,
      };
    }),
  );

  return NextResponse.json({ data: chatList });
}
