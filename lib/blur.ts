/** A heavily blurred JPEG copy of a photo, made in the browser: shrink to 16px wide, then smooth it back up. */
export async function blurImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const small = document.createElement("canvas");
  small.width = 16;
  small.height = Math.max(1, Math.round((16 * bitmap.height) / bitmap.width));
  small.getContext("2d")!.drawImage(bitmap, 0, 0, small.width, small.height);
  const big = document.createElement("canvas");
  big.width = 320;
  big.height = Math.round((320 * small.height) / small.width);
  const ctx = big.getContext("2d")!;
  ctx.filter = "blur(8px)";
  ctx.drawImage(small, 0, 0, big.width, big.height);
  return new Promise((resolve, reject) => big.toBlob((b) => (b ? resolve(b) : reject(new Error("blur failed"))), "image/jpeg", 0.7));
}
