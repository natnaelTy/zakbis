"use client";

import Link from "next/link";
import { ListChecks, Plane, Plus, ShoppingBag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { useSide } from "@/components/auth/use-side";
import { tabsFor, type TabLabel } from "@/lib/sides";
import { cn } from "@/lib/utils";

const icons = { Trips: Plane, Requests: ShoppingBag, Post: Plus, Activity: ListChecks, Profile: User };

/** The active side's tabs; nothing while loading or signed out (the header shows Sign in instead). */
export function TabBar({ active }: { active: TabLabel }) {
  const { side } = useSide();
  if (!side) return null;
  // One nav: a bottom tab bar on phones, inline in the header from md up. On phones Post is a raised green button (user's choice); on desktop it is a regular pill.
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:mx-0 md:max-w-none md:flex-1 md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
    >
      <ul className="grid grid-cols-4 md:flex md:items-center md:gap-1">
        {tabsFor(side).map(({ href, label }) => {
          const Icon = icons[label];
          const current = label === active;
          const isPost = label === "Post";
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                  "md:h-auto md:flex-row md:gap-2 md:rounded-full md:px-3 md:py-1.5 md:text-sm",
                  current && "text-brand-text hover:text-brand-text md:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full md:h-auto md:w-auto",
                    current && !isPost && "bg-accent md:bg-transparent",
                    isPost && "-mt-5 size-12 w-12 bg-primary text-primary-foreground shadow-[0_4px_12px_rgb(20_36_29/0.18)] ring-4 ring-card md:mt-0 md:size-auto md:bg-transparent md:text-current md:shadow-none md:ring-0",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5 md:size-4", isPost && "size-6 md:size-4")} strokeWidth={current || isPost ? 2.25 : 1.75} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function HeaderSignIn() {
  const { side } = useSide();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");
  if (side !== null) return null;
  return (
    <>
      <Button variant="outline" className="h-10 shrink-0 rounded-lg px-4 text-base font-semibold" onClick={() => requireAuth(() => {})}>
        Sign in
      </Button>
      {sheet}
    </>
  );
}
