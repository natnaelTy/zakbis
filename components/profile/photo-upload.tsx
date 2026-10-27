"use client";

import { useEffect, useState } from "react";
import { ImageUploadField } from "@/components/ui/image-uploader";
import { Field } from "@/components/request/item-fields";
import { createClient } from "@/lib/supabase/client";
import { blurImage } from "@/lib/blur";
import type { Side } from "@/lib/sides";

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]; // what the photo buckets accept

/**
 * The profile photo for one side. Receiver: one public image. Traveler: the real photo (shown after a request is
 * accepted) plus a blurred copy for everyone else. Each upload gets a new path, so no storage update is needed.
 */
export function PhotoUpload({ side }: { side: Side }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const id = `${side}-photo`;

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: p } = await supabase.from("profiles").select("receiver_photo_path, photo_path").eq("id", data.user.id).maybeSingle();
      if (side === "receiver" && p?.receiver_photo_path) setCurrent(supabase.storage.from("receiver-photos").getPublicUrl(p.receiver_photo_path).data.publicUrl);
      if (side === "traveler" && p?.photo_path) setCurrent((await supabase.storage.from("photos").createSignedUrl(p.photo_path, 3600)).data?.signedUrl ?? null);
    })();
  }, [side]);

  async function save(file: File | null) {
    setError(undefined);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const uid = data.user.id;
    setBusy(true);
    let fields: Record<string, string | null>;
    if (!file) fields = side === "receiver" ? { receiver_photo_path: null } : { photo_path: null, photo_blur_path: null };
    else {
      // file.type comes from the extension, so a renamed PDF passes it; only decoding proves it's an image.
      if (!(await createImageBitmap(file).then(() => true, () => false))) return (setBusy(false), setError("Please choose a JPG, PNG or WebP photo"));
      const name = `${uid}/${Date.now()}.${file.type.split("/")[1]}`;
      if (side === "receiver") {
        const up = await supabase.storage.from("receiver-photos").upload(name, file, { contentType: file.type });
        fields = { receiver_photo_path: name };
        if (up.error) return (setBusy(false), setError("Couldn't upload your photo. Please try again."));
      } else {
        const blurName = `${uid}/${Date.now()}.jpg`;
        const blurred = await blurImage(file).catch(() => null);
        const up1 = await supabase.storage.from("photos").upload(name, file, { contentType: file.type });
        const up2 = up1.error || !blurred ? up1 : await supabase.storage.from("photos-blur").upload(blurName, blurred, { contentType: "image/jpeg" });
        fields = { photo_path: name, photo_blur_path: blurName };
        if (up1.error || up2.error || !blurred) return (setBusy(false), setError("Couldn't upload your photo. Please try again."));
      }
    }
    const { error: saveError } = await supabase.from("profiles").update(fields).eq("id", uid);
    setBusy(false);
    if (saveError) return setError("Couldn't save your photo. Please try again.");
    setCurrent(file ? URL.createObjectURL(file) : null);
  }

  return (
    <Field id={id} label="Photo" hint={side === "traveler" ? "Receivers see it clearly once you accept their request." : "Travelers see this photo."} error={error}>
      <ImageUploadField
        id={id}
        label="profile photo"
        acceptTypes={IMAGE_TYPES}
        maxSize={MAX_BYTES}
        aspectRatio={1}
        className="max-w-40"
        value={current}
        isLoading={busy}
        error={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(f) => void save(f instanceof File ? f : null)}
        onReject={setError}
      />
    </Field>
  );
}
