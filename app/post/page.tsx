import { AppShell } from "@/components/app-shell";
import { PostRequestForm } from "./post-request-form";

export default function PostPage() {
  return (
    <AppShell active="Post">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">Post a request</h1>
        <p className="mt-1 text-base text-muted-foreground">Travelers flying to Addis can offer to bring it. You choose who.</p>
        <PostRequestForm />
      </main>
    </AppShell>
  );
}
