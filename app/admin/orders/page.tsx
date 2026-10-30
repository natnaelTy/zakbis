import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { OrderQueue } from "./order-queue";

// Admins only; everyone else gets a 404 so the page's existence isn't advertised.
export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("is_admin");
  if (admin !== true) notFound();

  return (
    <AppShell active="Profile">
      <main className="px-4 md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Orders to act on</h1>
        <nav className="flex flex-wrap gap-x-4 text-base font-medium text-brand-text">
          <Link href="/admin/reviews">Reviews</Link>
          <Link href="/admin/payments">Payment checks</Link>
          <Link href="/admin/trips">Trip checks</Link>
          <Link href="/admin/verifications">Traveler verifications</Link>
        </nav>
        <OrderQueue />
      </main>
    </AppShell>
  );
}
