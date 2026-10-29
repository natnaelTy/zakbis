/** An Ethiopian mobile (09…, 07…, +2519…, 2517…, spaces or dashes allowed) as 2519XXXXXXXX / 2517XXXXXXXX, or null. */
export function normalizeEtPhone(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "").replace(/^\+/, "");
  const m = /^(?:251|0)?([79]\d{8})$/.exec(d);
  return m ? `251${m[1]}` : null;
}

export const displayPhone = (p: string) => `+251 ${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}`;
