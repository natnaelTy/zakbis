import Link from "next/link";
import { ListChecks, MapPin, Plane, Plus, ShoppingBag, User } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Trips", icon: Plane },
  { href: "/requests", label: "Requests", icon: ShoppingBag },
  { href: "/post", label: "Post", icon: Plus },
  { href: "/activity", label: "Activity", icon: ListChecks },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ active, children }: { active: (typeof tabs)[number]["label"]; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24 md:max-w-4xl md:px-6 md:pb-12">
      <header className="flex items-center gap-6 px-4 pt-5 pb-3 md:px-0 md:py-6">
        <Link href="/" className="text-xl font-black tracking-[-0.03em]">
          zakbis
        </Link>

        {/* One nav: a bottom tab bar on phones, inline in the header from md up. */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t bg-card pb-[env(safe-area-inset-bottom)] md:static md:mx-0 md:max-w-none md:border-0 md:bg-transparent md:pb-0"
        >
          <ul className="grid grid-cols-5 md:flex md:gap-1">
            {tabs.map(({ href, label, icon: Icon }) => {
              const current = label === active;
              return (
                <li key={label}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground md:flex-row md:gap-2 md:rounded-full md:px-3 md:py-1.5 md:text-sm",
                      current && "text-brand-text hover:text-brand-text md:bg-accent",
                    )}
                  >
                    <span className={cn("flex h-7 w-12 items-center justify-center rounded-full md:h-auto md:w-auto", current && "bg-accent")}>
                      <Icon aria-hidden className="size-5 md:size-4" strokeWidth={current ? 2.25 : 1.75} />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin aria-hidden className="size-4" /> Addis Ababa
        </span>
      </header>

      {children}
    </div>
  );
}
