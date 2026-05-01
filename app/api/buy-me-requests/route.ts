import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type BuyMeRequest = {
  id: string;
  receiver_id: string;
  traveler_id: string | null;
  trip_id: string | null;
  product_url: string;
  product_name: string;
  product_image: string | null;
  estimated_price: number | null;
  destination: string;
  notes: string | null;
  status: "OPEN" | "ACCEPTED" | "PURCHASED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  receiver?: {
    full_name: string;
  };
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Could not load profile" }, { status: 400 });
  }

  if (profile.role === "RECEIVER") {
    const { data, error } = await supabase
      .from("buy_me_requests")
      .select("id, receiver_id, traveler_id, trip_id, product_url, product_name, product_image, estimated_price, destination, notes, status, created_at")
      .eq("receiver_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        userId: user.id,
        profile,
        requests: (data as BuyMeRequest[]) ?? [],
      },
    });
  }

  if (profile.role === "TRAVELER") {
    const { data, error } = await supabase
      .from("buy_me_requests")
      .select("id, receiver_id, traveler_id, trip_id, product_url, product_name, product_image, estimated_price, destination, notes, status, created_at")
      .or(`status.eq.OPEN,traveler_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rows = (data as BuyMeRequest[]) ?? [];
    const receiverIds = [...new Set(rows.map((row) => row.receiver_id))];

    if (receiverIds.length === 0) {
      return NextResponse.json({
        data: {
          userId: user.id,
          profile,
          requests: rows,
        },
      });
    }

    const { data: receivers } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", receiverIds);

    const byId = new Map((receivers ?? []).map((receiver: any) => [receiver.id, receiver.full_name]));

    return NextResponse.json({
      data: {
        userId: user.id,
        profile,
        requests: rows.map((row) => ({
          ...row,
          receiver: {
            full_name: byId.get(row.receiver_id) ?? "Receiver",
          },
        })),
      },
    });
  }

  return NextResponse.json({
    data: {
      userId: user.id,
      profile,
      requests: [],
    },
  });
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

  if (profile?.role !== "RECEIVER") {
    return NextResponse.json({ error: "Only receivers can create buy-me requests" }, { status: 403 });
  }

  // Determine request content type and parse accordingly
  const contentType = request.headers.get("content-type") ?? "";
  let productName = "";
  let productUrl: string | null = null;
  let productImage: File | null = null;
  let destination = "";
  let estimatedPrice: number | null = null;
  let notes = "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    productName = typeof body.product_name === "string" ? body.product_name.trim() : "";
    productUrl = typeof body.product_url === "string" ? body.product_url.trim() : null;
    destination = typeof body.destination === "string" ? body.destination.trim() : "";
    estimatedPrice =
      typeof body.estimated_price === "number" && Number.isFinite(body.estimated_price)
        ? body.estimated_price
        : null;
    notes = typeof body.notes === "string" ? body.notes.trim() : "";
  } else if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    productName = (form.get("product_name") as string | null) ?? "";
    productUrl = (form.get("product_url") as string | null) ?? null;
    productImage = (form.get("image") as File) ?? null;
    destination = (form.get("destination") as string | null) ?? "";
    const price = form.get("estimated_price");
    estimatedPrice = price ? Number(price) : null;
    notes = (form.get("notes") as string | null) ?? "";
  }

  // product_name and destination are always required. At least one of product_url or product_image must be provided.
  if (!productName || !destination) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!productUrl && !productImage) {
    return NextResponse.json({ error: "Either product URL or product image must be provided" }, { status: 400 });
  }

  // Build the record to insert
  const insertData: any = {
    receiver_id: user.id,
    product_name: productName,
    product_url: productUrl,
    destination,
    estimated_price: estimatedPrice,
    notes: notes || null,
    status: "OPEN",
    product_image: null,
  };

  // If an image was provided, upload it to Supabase storage and store the public URL.
  if (productImage) {
    const filePath = `${user.id}/${Date.now()}_${productImage.name}`;
    const { error: uploadError } = await supabase.storage.from("productimage").upload(filePath, productImage);
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }
    const { data: publicData } = supabase.storage.from("productimage").getPublicUrl(filePath);
    insertData.product_image = publicData?.publicUrl ?? null;
  }

  // Insert the request record
  const { data, error } = await supabase.from("buy_me_requests").insert(insertData).select("id").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data });
}
