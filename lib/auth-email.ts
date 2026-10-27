/** Internal address for Telegram-only accounts; never mailed, never shown. Random so nobody can pre-register a user's address. */
export const internalEmail = () => `tg-${crypto.randomUUID()}@users.zakbis.com`;

export const isInternalEmail = (email: string) => email.trim().toLowerCase().endsWith("@users.zakbis.com");

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain}`;
}

/** Only same-site paths after sign-in redirects; "//x" and "/\x" would leave the site. */
export const safeNextPath = (next: string | null) => (next && /^\/(?![/\\])/.test(next) && !next.includes("\\") ? next : "/");
