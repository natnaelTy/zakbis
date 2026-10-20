import Image from "next/image";
import Link from "next/link";
import { ListChecks, MapPin, Plane, Plus, ShoppingBag, User } from "lucide-react";
import logo from "@/public/company-logo/zakbislogo.png";
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
    <div className="mx-auto min-h-dvh max-w-md pb-28 md:max-w-4xl md:px-6 md:pb-12">
      {/* Sticky from md up so desktop nav stays reachable; on phones the tab bar is the nav. */}
      <header className="flex items-center gap-6 px-4 pt-5 pb-3 md:sticky md:top-0 md:z-20 md:-mx-6 md:border-b md:bg-background/90 md:px-6 md:py-4 md:backdrop-blur">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md text-xl font-black tracking-[-0.03em]">
          {/* next/image serves a resized copy, not the 790 KB original. */}
          <Image src={logo} alt="" width={28} height={26} priority className="h-[26px] w-auto" />
          Zakbis
        </Link>

        {/* One nav: a bottom tab bar on phones, inline in the header from md up. On phones Post is a raised green button (user's choice); on desktop it is a regular pill. */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:mx-0 md:max-w-none md:flex-1 md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none"
        >
          <ul className="grid grid-cols-5 md:flex md:items-center md:gap-1">
            {tabs.map(({ href, label, icon: Icon }) => {
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

        <span className="ml-auto flex shrink-0 items-center gap-1 text-sm text-muted-foreground md:ml-0">
          <MapPin aria-hidden className="size-4" /> Addis Ababa
        </span>
      </header>

      {children}
    </div>
  );
}
