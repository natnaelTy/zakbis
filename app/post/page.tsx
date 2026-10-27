import { AppShell } from "@/components/app-shell";
import { SideGate } from "@/components/auth/side-gate";
import { PostRequestForm } from "./post-request-form";

export default function PostPage() {
  return (
    <AppShell active="Post">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Post a request</h1>
        <SideGate side="receiver">
          <PostRequestForm />
        </SideGate>
      </main>
    </AppShell>
  );
}
