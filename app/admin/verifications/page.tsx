import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { ReviewList } from "./review-list";

// Admins only; everyone else gets a 404 so the page's existence isn't advertised.
export default async function AdminVerificationsPage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) notFound();

  return (
    <AppShell active="Profile">
      <main className="px-4 md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Traveler verifications</h1>
        <nav className="flex gap-4 text-base font-medium text-brand-text">
          <Link href="/admin/orders">Orders</Link>
          <Link href="/admin/trips">Trip checks</Link>
          <Link href="/admin/payments">Payment checks</Link>
        </nav>
        <ReviewList />
      </main>
    </AppShell>
  );
}
