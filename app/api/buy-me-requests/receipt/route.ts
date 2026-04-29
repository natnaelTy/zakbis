import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST: Traveler uploads a receipt file or URL to confirm a purchase.
 * - If file is provided: uploads to Supabase Storage and advances status
 * - If URL is provided: uses the provided URL and advances status
 * - Also advances buy_me_request status from ACCEPTED → PURCHASED.
 *
 * PATCH: Advance buy_me_request status:
 *   PURCHASED → DELIVERED (traveler confirms delivery)
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

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

  if (profile?.role !== "TRAVELER") {
    return NextResponse.json({ error: "Only travelers can upload receipts" }, { status: 403 });
  }

  // Check if this is a file upload or URL upload
  const contentType = request.headers.get("content-type") || "";
  
  if (contentType.includes("multipart/form-data")) {
    // File upload
    return handleFileUpload(request, supabase, user);
  } else {
    // URL upload (legacy support)
    const body = await request.json();
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : "";
    return handleUrlUpload(requestId, receiptUrl, supabase, user);
  }
}

async function handleFileUpload(request: NextRequest, supabase: any, user: any) {
  const formData = await request.formData();
  const requestId = formData.get("requestId") as string;
  const file = formData.get("file") as File | null;

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: JPEG, PNG, WebP` },
      { status: 400 },
    );
  }

  // Verify the request exists, is ACCEPTED, and belongs to this traveler
  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, traveler_id, receiver_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.traveler_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned traveler" }, { status: 403 });
  }

  if (row.status !== "ACCEPTED") {
    return NextResponse.json(
      { error: `Cannot upload receipt — current status is ${row.status}` },
      { status: 400 },
    );
  }

  // Upload file to Supabase Storage
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const filePath = `receipts/${user.id}/${timestamp}_${sanitizedName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from("receipts")
    .getPublicUrl(uploadData.path);

  // Update the request with receipt and advance status
  const { data: updated, error: updateError } = await supabase
    .from("buy_me_requests")
    .update({
      receipt_url: publicUrl,
      status: "PURCHASED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "ACCEPTED")
    .select("id, status, receipt_url")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update request" },
      { status: 400 },
    );
  }

  return NextResponse.json({ 
    data: {
      ...updated,
      url: publicUrl,
      path: uploadData.path,
    },
  });
}

async function handleUrlUpload(requestId: string, receiptUrl: string, supabase: any, user: any) {
  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  if (!receiptUrl) {
    return NextResponse.json({ error: "receiptUrl is required" }, { status: 400 });
  }

  // Verify the request exists, is ACCEPTED, and belongs to this traveler
  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, traveler_id, receiver_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.traveler_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned traveler" }, { status: 403 });
  }

  if (row.status !== "ACCEPTED") {
    return NextResponse.json(
      { error: `Cannot upload receipt — current status is ${row.status}` },
      { status: 400 },
    );
  }

  // Update the request with receipt and advance status
  const { data: updated, error: updateError } = await supabase
    .from("buy_me_requests")
    .update({
      receipt_url: receiptUrl,
      status: "PURCHASED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "ACCEPTED") // optimistic lock
    .select("id, status, receipt_url")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update request" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: updated });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const requestId = typeof body.requestId === "string" ? body.requestId : "";

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const { data: row, error: rowError } = await supabase
    .from("buy_me_requests")
    .select("id, status, traveler_id")
    .eq("id", requestId)
    .maybeSingle();

  if (rowError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (row.traveler_id !== user.id) {
    return NextResponse.json({ error: "You are not the assigned traveler" }, { status: 403 });
  }

  // Valid transitions: PURCHASED → DELIVERED
  if (row.status !== "PURCHASED") {
    return NextResponse.json(
      { error: `Cannot advance — current status is ${row.status}` },
      { status: 400 },
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("buy_me_requests")
    .update({
      status: "DELIVERED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "PURCHASED")
    .select("id, status")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not advance status" },
      { status: 400 },
    );
  }

  return NextResponse.json({ data: updated });
}