import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST: Upload an image file to Supabase Storage.
 * Accepts multipart/form-data with a "file" field.
 * Returns the public URL of the uploaded image.
 *
 * Files are stored under: receipts/{user_id}/{timestamp}_{filename}
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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

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

  // Generate a unique path: {user_id}/{timestamp}_{sanitized_filename}
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const filePath = `${user.id}/${timestamp}_${sanitizedName}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { data, error } = await supabase.storage
    .from("receipts")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Get the public URL
  const { data: { publicUrl } } = supabase.storage
    .from("receipts")
    .getPublicUrl(data.path);

  return NextResponse.json({
    data: {
      url: publicUrl,
      path: data.path,
      size: file.size,
      type: file.type,
    },
  });
}
