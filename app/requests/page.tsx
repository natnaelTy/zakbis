import { AppShell } from "@/components/app-shell";
import { SideGate } from "@/components/auth/side-gate";

export default function RequestsPage() {
  return (
    <AppShell active="Explore">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Open requests</h1>
        <SideGate side="traveler">
          <p className="mt-2 text-base text-muted-foreground">Open requests are coming soon.</p>
        </SideGate>
      </main>
    </AppShell>
  );
}
