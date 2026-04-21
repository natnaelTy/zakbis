import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return { supabase, user, profile };
}

async function attachChatIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return rows;

  const requestIds = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (requestIds.length === 0) return rows;

  const { data: chats } = await supabase
    .from("chats")
    .select("id, delivery_request_id")
    .in("delivery_request_id", requestIds);

  const chatByRequestId = new Map(
    (chats ?? [])
      .filter((chat) => chat.delivery_request_id)
      .map((chat) => [chat.delivery_request_id as string, chat.id as string]),
  );

  return rows.map((row) => ({
    ...row,
    chat_id: chatByRequestId.get(row.id as string) ?? null,
  }));
}

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

export async function GET(request: NextRequest) {
  const { supabase, user, profile } = await getAuthenticatedContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get("scope");

  let data: Array<Record<string, unknown>> | null = null;
  let error: { message: string } | null = null;

  if (scope === "traveler") {
    if (profile?.role !== "TRAVELER") {
      return NextResponse.json({ error: "Only travelers can access this endpoint" }, { status: 403 });
    }

    const result = await supabase
      .from("delivery_requests")
      .select(
        `
          id,
          item_description,
          weight,
          pickup_city,
          dropoff_city,
          status,
          created_at,
          sender:profiles!delivery_requests_sender_id_fkey(full_name),
          receiver:profiles!delivery_requests_receiver_id_fkey(full_name),
          trip:trips!inner(
            id,
            traveler_id,
            flight_number,
            departure_city,
            destination_city,
            departure_date,
            price_per_kg
          )
        `,
      )
      .eq("trip.traveler_id", user.id)
      .order("created_at", { ascending: false });

    data = result.data as Array<Record<string, unknown>> | null;
    error = result.error as { message: string } | null;
  } else if (scope === "owner") {
    if (profile?.role !== "SENDER" && profile?.role !== "RECEIVER") {
      return NextResponse.json({ error: "Only sender/receiver can access this endpoint" }, { status: 403 });
    }

    const participantColumn = profile.role === "SENDER" ? "sender_id" : "receiver_id";

    const result = await supabase
      .from("delivery_requests")
      .select(
        `
          id,
          item_description,
          weight,
          pickup_city,
          dropoff_city,
          status,
          created_at,
          sender:profiles!delivery_requests_sender_id_fkey(full_name),
          receiver:profiles!delivery_requests_receiver_id_fkey(full_name),
          trip:trips!delivery_requests_trip_id_fkey(
            id,
            flight_number,
            departure_city,
            destination_city,
            departure_date,
            traveler:profiles!trips_traveler_id_fkey(full_name)
          )
        `,
      )
      .eq(participantColumn, user.id)
      .order("created_at", { ascending: false });

    data = result.data as Array<Record<string, unknown>> | null;
    error = result.error as { message: string } | null;
  } else {
    return NextResponse.json({ error: "Unsupported scope" }, { status: 400 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const withChatIds = await attachChatIds(supabase, data ?? []);
  return NextResponse.json({ data: withChatIds });
}

export async function POST(request: NextRequest) {
  const { supabase, user, profile } = await getAuthenticatedContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const itemDescription = typeof body.itemDescription === "string" ? body.itemDescription.trim() : "";
  const pickupCity = typeof body.pickupCity === "string" ? body.pickupCity.trim() : "";
  const dropoffCity = typeof body.dropoffCity === "string" ? body.dropoffCity.trim() : "";
  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const weight = Number(body.weight);

  if (!itemDescription || !pickupCity || !dropoffCity || !tripId || !Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json({ error: "Invalid delivery request payload" }, { status: 400 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Could not resolve user profile" }, { status: 400 });
  }

  if (profile.role !== "SENDER" && profile.role !== "RECEIVER") {
    return NextResponse.json({ error: "Only sender/receiver can create request" }, { status: 403 });
  }

  const payload = {
    trip_id: tripId,
    item_description: itemDescription,
    weight,
    pickup_city: pickupCity,
    dropoff_city: dropoffCity,
    status: "PENDING",
    ...(profile.role === "SENDER" ? { sender_id: user.id } : { receiver_id: user.id }),
  };

  const { data, error } = await supabase
    .from("delivery_requests")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, profile } = await getAuthenticatedContext();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile?.role !== "TRAVELER") {
    return NextResponse.json({ error: "Only travelers can accept requests" }, { status: 403 });
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

  const ownerId = Array.isArray((requestRow as any).trip)
    ? (requestRow as any).trip[0]?.traveler_id
    : (requestRow as any).trip?.traveler_id;

  if (ownerId !== user.id) {
    return NextResponse.json({ error: "You cannot accept this request" }, { status: 403 });
  }

  const currentStatus = (requestRow as any).status as string;
  let data: { id: string; status: string } | null = null;

  if (currentStatus === "PENDING") {
    const result = await supabase
      .from("delivery_requests")
      .update({ status: "MATCHED" })
      .eq("id", requestId)
      .eq("status", "PENDING")
      .select("id, status")
      .maybeSingle();

    if (result.error || !result.data) {
      return NextResponse.json({ error: result.error?.message ?? "Could not accept request" }, { status: 400 });
    }

    data = result.data;
  } else if (currentStatus === "MATCHED") {
    data = { id: requestId, status: "MATCHED" };
  } else {
    return NextResponse.json({ error: "Request cannot be accepted in current status" }, { status: 400 });
  }

  let chatId: string;

  try {
    chatId = await ensureDeliveryChat(
      supabase,
      requestId,
      [
        user.id,
        ((requestRow as any).sender_id as string | null) ?? "",
        ((requestRow as any).receiver_id as string | null) ?? "",
      ],
    );
  } catch (chatError) {
    return NextResponse.json(
      { error: chatError instanceof Error ? chatError.message : "Could not create chat" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: { ...data, chat_id: chatId } });
}
