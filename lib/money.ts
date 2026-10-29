export type Currency = "USD" | "GBP" | "CNY" | "AED";

export const originCurrency: Record<"US" | "GB" | "CN" | "AE", Currency> = { US: "USD", GB: "GBP", CN: "CNY", AE: "AED" };

/** Whole-birr quote. Zakbis keeps feePct% of the reward only (15%, stored in the settings table); the receiver never pays it. */
export function quote({ unitPrice, quantity, rate, reward, feePct }: { unitPrice: number; quantity: number; rate: number; reward: number; feePct: number }) {
  const itemEtb = Math.round(unitPrice * quantity * rate);
  const fee = Math.round((reward * feePct) / 100); // integer math first: 0.09 * 50 is 4.4999… in floating point
  return { itemEtb, reward, total: itemEtb + reward, fee, payout: itemEtb + reward - fee };
}

/** What the traveler keeps of a reward after Zakbis's cut; same rounding as fee_etb in the database. */
export const takeHome = (reward: number, feePct: number) => reward - Math.round((reward * feePct) / 100);

export function parseAmount(raw: string): number | null {
  const t = raw.trim();
  // Commas only as thousands groups: "19,99" is a decimal comma and would otherwise read as 1999.
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

export const etb = (n: number) => `${n.toLocaleString("en-US")} ETB`;
/** Whole-birr amount of at least 1 ETB; "0.4" would otherwise pass validation and round to a 0 ETB reward. */
export function parseEtb(raw: string): number | null {
  const n = parseAmount(raw);
  return n && Math.round(n) >= 1 ? Math.round(n) : null;
}

/** A request needs a product link or a screenshot (either is enough); a link that is typed must be valid. */
export function productError(link: string, hasScreenshot: boolean): string | undefined {
  if (link.trim()) return normalizeUrl(link) ? undefined : "Check the product link";
  return hasScreenshot ? undefined : "Add a product link or a screenshot";
}
