import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { AppShell } from "@/components/app-shell";
import { OrderDetail } from "./order-detail";

// No SideGate: the same page serves the receiver and the traveler on the order (the data decides who is looking).
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell active="Orders">
      <main className="px-4 pb-24 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/orders" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ArrowLeft aria-hidden className="size-5" /> Orders
        </Link>
        <OrderDetail id={id} />
      </main>
    </AppShell>
  );
}
