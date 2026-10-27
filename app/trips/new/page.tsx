import { AppShell } from "@/components/app-shell";
import { SideGate } from "@/components/auth/side-gate";
import { PostTripStatus } from "./post-trip-status";

export default function NewTripPage() {
  return (
    <AppShell active="Post">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Post a trip</h1>
        <SideGate side="traveler">
          <PostTripStatus />
        </SideGate>
      </main>
    </AppShell>
  );
}
