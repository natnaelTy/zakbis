import { createClient } from "@/lib/supabase/client";

export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Uploads an image to the caller's folder in the private proofs bucket (payment screenshots, receipts, item photos). */
export async function uploadProof(file: File): Promise<{ path: string } | { error: string }> {
  if (!PROOF_TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WebP image" };
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please sign in again" };
  const path = `${auth.user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
  const { error } = await supabase.storage.from("proofs").upload(path, file, { contentType: file.type });
  return error ? { error: "Couldn't upload. Please try again." } : { path };
}
