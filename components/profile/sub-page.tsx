import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { AppShell } from "@/components/app-shell";

/** A page one tap below Account: back link, title, optional note, content. */
export function SubPage({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <AppShell active="Profile">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/profile" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ArrowLeft aria-hidden className="size-5" /> Account
        </Link>
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">{title}</h1>
        {note && <p className="mt-1 text-[13px] text-muted-foreground">{note}</p>}
        {children}
      </main>
    </AppShell>
  );
}
