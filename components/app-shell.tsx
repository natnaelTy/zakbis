import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import logo from "@/public/company-logo/zakbislogo.png";
import type { TabLabel } from "@/lib/sides";
import { HeaderSignIn, TabBar } from "@/components/tab-bar";

export function AppShell({ active, children }: { active: TabLabel; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-28 md:max-w-4xl md:px-6 md:pb-12">
      {/* Sticky from md up so desktop nav stays reachable; on phones the tab bar is the nav. */}
      <header className="flex items-center gap-6 px-4 pt-5 pb-3 md:sticky md:top-0 md:z-20 md:-mx-6 md:border-b md:bg-background/90 md:px-6 md:py-4 md:backdrop-blur">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md text-xl font-black tracking-[-0.03em]">
          {/* next/image serves a resized copy, not the 790 KB original. */}
          <Image src={logo} alt="" width={28} height={26} priority className="h-[26px] w-auto" />
          Zakbis
        </Link>

        <TabBar active={active} />

        <span className="ml-auto flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <MapPin aria-hidden className="size-4" /> Addis Ababa
        </span>
        <HeaderSignIn />
      </header>

      {children}
    </div>
  );
}
