import { AppShell } from "@/components/app-shell";

export default function InboxPage() {
  return (
    <AppShell active="Inbox">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Inbox</h1>
        <p className="mt-6 text-base text-muted-foreground">No updates yet</p>
      </main>
    </AppShell>
  );
}
