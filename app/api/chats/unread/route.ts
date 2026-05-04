import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET: Returns per-chat unread counts + total unread for the current user.
 * POST: Marks a specific chat as read (upserts last_read timestamp).
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all chats the user is participating in
  const [triangularChats, shoppingChats] = await Promise.all([
    supabase
      .from("triangular_chats")
      .select("id")
      .or(`sender_id.eq.${user.id},traveler_id.eq.${user.id},receiver_id.eq.${user.id}`),
    supabase
      .from("shopping_chats")
      .select("id")
      .or(`traveler_id.eq.${user.id},receiver_id.eq.${user.id}`),
  ]);

  const chatIds = [
    ...((triangularChats.data ?? []).map((row) => row.id)),
    ...((shoppingChats.data ?? []).map((row) => row.id)),
  ];

  if (chatIds.length === 0) {
    return NextResponse.json({ data: { total: 0, chats: {} } });
  }

  // Get read receipts for this user
  const { data: receipts } = await supabase
    .from("chat_read_receipts")
    .select("chat_id, last_read")
    .eq("user_id", user.id)
    .in("chat_id", chatIds);

  const lastReadMap = new Map(
    (receipts ?? []).map((r) => [r.chat_id, r.last_read as string]),
  );

  // For each chat, count messages after last_read
  // We batch this into a single query using a union approach
  const unreadCounts: Record<string, number> = {};
  let total = 0;

  // Process in parallel batches for performance
  const countPromises = chatIds.map(async (chatId) => {
    const lastRead = lastReadMap.get(chatId);

    let query = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId)
      .neq("sender_id", user.id); // Don't count user's own messages

    if (lastRead) {
      query = query.gt("created_at", lastRead);
    }

    const { count } = await query;
    return { chatId, count: count ?? 0 };
  });

  const results = await Promise.all(countPromises);

  for (const { chatId, count } of results) {
    unreadCounts[chatId] = count;
    total += count;
  }

  return NextResponse.json({ data: { total, chats: unreadCounts } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const chatId = typeof body.chatId === "string" ? body.chatId : "";

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  // Verify user is a participant
  const [{ data: triangularChat }, { data: shoppingChat }] = await Promise.all([
    supabase
      .from("triangular_chats")
      .select("id")
      .eq("id", chatId)
      .or(`sender_id.eq.${user.id},traveler_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .maybeSingle(),
    supabase
      .from("shopping_chats")
      .select("id")
      .eq("id", chatId)
      .or(`traveler_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .maybeSingle(),
  ]);

  if (!triangularChat && !shoppingChat) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Upsert the read receipt
  const { error } = await supabase
    .from("chat_read_receipts")
    .upsert(
      { chat_id: chatId, user_id: user.id, last_read: new Date().toISOString() },
      { onConflict: "chat_id,user_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: { success: true } });
}
