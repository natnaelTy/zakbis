import { createHash } from "node:crypto";

type Env = Record<string, string | undefined>;

/** live: AfroMessage is set up. test: a fixed code for fake numbers, only in local dev (never a deployed build). off: "Phone check opens soon". */
export function smsMode(env: Env): "live" | "test" | "off" {
  if (env.AFROMESSAGE_TOKEN && env.AFROMESSAGE_IDENTIFIER && env.AFROMESSAGE_SENDER) return "live";
  return env.ZAKBIS_SMS_TEST_CODE && env.NODE_ENV !== "production" ? "test" : "off";
}

/** Paid SMS: one a minute and 3 per 15 min per user, 3 an hour to one number across all accounts, 300 a day in total. */
export function sendLimit({ userTimes, phoneLastHour, sentToday, now }: { userTimes: number[]; phoneLastHour: number; sentToday: number; now: number }) {
  const recent = userTimes.filter((t) => now - t < 15 * 60_000);
  if (recent.some((t) => now - t < 60_000)) return "too_soon";
  if (recent.length >= 3 || phoneLastHour >= 3 || sentToday >= 300) return "too_many";
  return null;
}

export const isTestNumber = (p: string) => /^2519000000\d\d$/.test(p);

export const hashCode = (code: string, uid: string) => createHash("sha256").update(`${code}:${uid}`).digest("hex");

/** Sends through AfroMessage's single-SMS API; true when it accepted the message. */
export async function sendSms(env: Env, to: string, text: string): Promise<boolean> {
  const url = new URL("https://api.afromessage.com/api/send");
  url.search = new URLSearchParams({ from: env.AFROMESSAGE_IDENTIFIER!, sender: env.AFROMESSAGE_SENDER!, to, message: text }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.AFROMESSAGE_TOKEN}` } }).catch(() => null);
  if (!res?.ok) return false;
  const body = (await res.json().catch(() => null)) as { acknowledge?: string } | null;
  return body?.acknowledge === "success";
}
