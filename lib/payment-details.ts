export type PayMethod = "telebirr" | "bank";
type Details = { label: string; account: string; name: string };

/** Zakbis's receiving accounts from env; a method shows only when both its account and name are set. */
export function paymentDetails(env: Record<string, string | undefined>): Partial<Record<PayMethod, Details>> {
  const out: Partial<Record<PayMethod, Details>> = {};
  const tb = [env.NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER, env.NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME];
  const cbe = [env.NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT, env.NEXT_PUBLIC_ZAKBIS_CBE_NAME];
  if (tb[0] && tb[1]) out.telebirr = { label: "Telebirr", account: tb[0], name: tb[1] };
  if (cbe[0] && cbe[1]) out.bank = { label: "CBE", account: cbe[0], name: cbe[1] };
  return out;
}
