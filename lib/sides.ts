export type Side = "receiver" | "traveler";
export type TabLabel = "Explore" | "Orders" | "Post" | "Inbox" | "Profile";

export function tabsFor(side: Side): { href: string; label: TabLabel }[] {
  return [
    { href: side === "receiver" ? "/" : "/requests", label: "Explore" },
    { href: "/orders", label: "Orders" },
    { href: side === "receiver" ? "/post" : "/trips/new", label: "Post" },
    { href: "/inbox", label: "Inbox" },
    { href: "/profile", label: "Profile" },
  ];
}

export const homeFor = (side: Side) => tabsFor(side)[0].href;

/**
 * What to do once the sign-in sheet finishes. `needs` is the side the pending action belongs to (if any);
 * `isNew` means the side was picked just now. A new traveler always starts at verification.
 */
export function afterSignIn(needs: Side | undefined, side: Side, isNew: boolean): "run" | { push: string } {
  if (needs === side) return "run";
  const start = { push: side === "traveler" && isNew ? "/traveler/verify" : homeFor(side) };
  if (needs) return start;
  return side === "traveler" && isNew ? start : "run";
}
