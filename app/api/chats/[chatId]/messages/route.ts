import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

async function ensureChatAccess(chatId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: participant } = await supabase
    .from("chat_participants")
    .select("chat_id")
    .eq("chat_id", chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!participant) {
    return { supabase, user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, user, error: null as NextResponse<unknown> | null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { chatId } = await context.params;
  const { supabase, user, error: accessError } = await ensureChatAccess(chatId);

  if (accessError || !user) {
    return accessError ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
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

  return NextResponse.json({ data: messages, currentUserId: user.id });
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
