export type VerificationState = "none" | "pending" | "verified" | "rejected" | "expired";

export function verificationState(v: { status: "pending" | "approved" | "rejected"; passport_expiry: string } | null, today: string): VerificationState {
  if (!v) return "none";
  if (v.status === "approved") return v.passport_expiry >= today ? "verified" : "expired";
  return v.status;
}

const labels = {
  pending: { text: "Checking", tone: "muted" },
  verified: { text: "Verified", tone: "good" },
  rejected: { text: "Action needed", tone: "bad" },
  expired: { text: "Passport expired", tone: "bad" },
} as const;

export const verificationLabel = (s: VerificationState) => (s === "none" ? null : labels[s]);

export type Payout = { method: "telebirr" | "bank"; account_name: string; account_number: string; bank_name: string };

export function payoutErrors(p: Payout) {
  const e: Partial<Record<"accountName" | "accountNumber" | "bankName", string>> = {};
  if (!p.account_name.trim()) e.accountName = "Enter the account holder's name";
  if (!/^\+?[0-9 ]{6,20}$/.test(p.account_number.trim())) e.accountNumber = p.method === "telebirr" ? "Enter your Telebirr phone number" : "Enter the account number";
  if (p.method === "bank" && !p.bank_name.trim()) e.bankName = "Enter the bank name";
  return e;
}

/** Pending travelers wait for the admin and verified ones are done; only the rest have something to submit. */
export const needsVerifyForm = (s: VerificationState) => s === "none" || s === "rejected" || s === "expired";
