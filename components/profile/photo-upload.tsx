"use client";

import { useEffect, useState } from "react";
import { ImageUploadField } from "@/components/ui/image-uploader";
import { Field } from "@/components/request/item-fields";
import { createClient } from "@/lib/supabase/client";
import { blurImage } from "@/lib/blur";
import { receiverPhotoSrc } from "@/lib/photos";
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
      // photo_path is a private column: selecting it alongside anything fails the whole read, so the traveler side asks my_photo_path().
      if (side === "receiver") {
        const { data: p } = await supabase.from("profiles").select("receiver_photo_path").eq("id", data.user.id).maybeSingle();
        if (p?.receiver_photo_path) setCurrent(receiverPhotoSrc(p.receiver_photo_path, (path) => supabase.storage.from("receiver-photos").getPublicUrl(path).data.publicUrl));
      } else {
        const { data: path } = await supabase.rpc("my_photo_path");
        if (path) setCurrent((await supabase.storage.from("photos").createSignedUrl(path, 3600)).data?.signedUrl ?? null);
      }
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
