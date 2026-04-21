import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TravelerDashboard } from "@/components/dashboard/traveler-dashboard";
import { SenderReceiverDashboard } from "@/components/dashboard/sender-receiver-dashboard";

export default async function DashboardPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const cookie = headerStore.get("cookie") ?? "";

  if (!host) redirect("/auth/login");

  const response = await fetch(`${protocol}://${host}/api/dashboard`, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });

  if (!response.ok) redirect("/auth/login");

  const payload = await response.json();
  const profile = payload?.data;

  if (!profile) redirect("/auth/login");

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 pt-8">
      {/* Greeting */}
      <div className="mb-6">
        <p className="text-sm text-slate-500 font-medium">Selam 👋</p>
        <h1 className="text-2xl font-bold tracking-tight text-black mt-0.5">
          {profile.full_name.split(" ")[0]}
        </h1>
      </div>

      {/* Role badge */}
      <div className="inline-flex items-center gap-1.5 bg-black text-white text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
        {profile.role}
      </div>

      {/* Role-based dashboard */}
      {profile.role === "TRAVELER" ? (
        <TravelerDashboard profile={profile} />
      ) : (
        <SenderReceiverDashboard profile={profile} />
      )}
    </main>
  );
}
