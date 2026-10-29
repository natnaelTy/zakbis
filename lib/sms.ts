import { createHash } from "node:crypto";

type Env = Record<string, string | undefined>;

/** live: AfroMessage is set up. test: a fixed code for fake numbers only, never alongside a live sender. off: "Phone check opens soon". */
export function smsMode(env: Env): "live" | "test" | "off" {
  if (env.AFROMESSAGE_TOKEN && env.AFROMESSAGE_IDENTIFIER && env.AFROMESSAGE_SENDER) return "live";
  return env.ZAKBIS_SMS_TEST_CODE ? "test" : "off";
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
