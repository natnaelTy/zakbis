/** Photo hosts Telegram and Google give at sign-up; same list as the receiver_photo_source constraint (0006). */
const PROVIDER_PHOTO = /^https:\/\/(t\.me\/i\/userpic\/|lh3\.googleusercontent\.com\/)/;

export const isProviderPhoto = (url: string) => PROVIDER_PHOTO.test(url);

/**
 * receiver_photo_path is either an upload in the receiver-photos bucket or, from sign-up, the Telegram or Google
 * photo link. Any other link is ignored.
 */
export function receiverPhotoSrc(path: string, bucketUrl: (path: string) => string): string | null {
  if (isProviderPhoto(path)) return path;
  return /^[a-z]+:/i.test(path) ? null : bucketUrl(path);
}
