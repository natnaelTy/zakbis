import { AppShell } from "@/components/app-shell";
import { OrdersPanel } from "./orders-panel";

export default function OrdersPage() {
  return (
    <AppShell active="Orders">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Orders</h1>
        <OrdersPanel />
      </main>
    </AppShell>
  );
}
