import { createClient } from "@/lib/supabase/client";

/** Uploads a ticket, roster or airline notice to the caller's folder in the private tickets bucket. */
export async function uploadTicket(file: File): Promise<{ path: string } | { error: string }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please sign in again." };
  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("tickets").upload(path, file, { contentType: file.type });
  return up.error ? { error: "Couldn't upload your ticket. Please try again." } : { path };
}
