import { AppShell } from "@/components/app-shell";
import { ProfilePanel } from "./profile-panel";

export default function ProfilePage() {
  return (
    <AppShell active="Profile">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Account</h1>
        <ProfilePanel />
      </main>
    </AppShell>
  );
}
