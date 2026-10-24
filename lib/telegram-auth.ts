import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TelegramLogin = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

const MAX_AGE_SEC = 24 * 60 * 60;

/** Checks a Telegram Login Widget payload (https://core.telegram.org/widgets/login#checking-authorization). Null if forged or stale. */
export function verifyTelegramLogin(data: Record<string, unknown>, botToken: string, nowSec: number): TelegramLogin | null {
  const { hash, ...fields } = data;
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const check = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const key = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", key).update(check).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const id = Number(fields.id);
  const authDate = Number(fields.auth_date);
  if (!Number.isSafeInteger(id) || !Number.isFinite(authDate) || nowSec - authDate > MAX_AGE_SEC) return null;
  return { ...(fields as Omit<TelegramLogin, "hash">), id, auth_date: authDate, hash };
}

// Re-exported so server code can keep one import; the browser imports ./auth-email directly (no node:crypto).
export { internalEmail, isInternalEmail, maskEmail } from "./auth-email.ts";

/** Refuses cross-site POSTs (login CSRF / forced linking): the Origin header must be this site. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host);
  } catch {
    return false;
  }
}
