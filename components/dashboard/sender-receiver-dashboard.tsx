"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Search, ChevronRight, Clock, CheckCircle2, Truck, Plus, TrendingUp, Loader2, AlertCircle } from "lucide-react";
import { DashboardMetricCard } from "@/components/ui/dashboard-overview";
import { useEnsureDeliveryChatMutation, useGetOwnerDeliveryRequestsQuery } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  rating: number;
  verified: boolean;
}

interface SenderReceiverDashboardProps {
  profile: Profile;
}

const statusConfig = {
  PENDING: { label: "Pending", icon: Clock, color: "text-slate-500", bg: "bg-slate-100" },
  MATCHED: { label: "Matched", icon: CheckCircle2, color: "text-black", bg: "bg-black/5" },
  PICKED_UP: { label: "Picked Up", icon: Truck, color: "text-black", bg: "bg-black/5" },
  IN_TRANSIT: { label: "In Transit", icon: Truck, color: "text-black", bg: "bg-black/5" },
  ARRIVED: { label: "Arrived", icon: CheckCircle2, color: "text-black", bg: "bg-black/5" },
  DELIVERED: { label: "Delivered", icon: CheckCircle2, color: "text-black", bg: "bg-black/5" },
  CANCELLED: { label: "Cancelled", icon: Clock, color: "text-slate-500", bg: "bg-slate-100" },
};

export function SenderReceiverDashboard({ profile }: SenderReceiverDashboardProps) {
  const router = useRouter();
  const isSender = profile.role === "SENDER";
  const { data: requests = [], isLoading, isFetching } = useGetOwnerDeliveryRequestsQuery();
  const [ensureDeliveryChat, { isLoading: ensuringChat }] = useEnsureDeliveryChatMutation();

  const activeCount = requests.filter((r) => ["PENDING", "MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"].includes(r.status)).length;
  const deliveredCount = requests.filter((r) => r.status === "DELIVERED").length;

  return (
    <div className="space-y-6">
      {/* Stats row - Using DashboardMetricCard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardMetricCard
          title="Active"
          value={String(activeCount)}
          icon={TrendingUp}
          trendChange="live"
          trendType="up"
        />
        <DashboardMetricCard
          title="Delivered"
          value={String(deliveredCount)}
          icon={CheckCircle2}
          trendChange="all time"
          trendType="up"
        />
        <DashboardMetricCard
          title="Total Requests"
          value={String(requests.length)}
          icon={Package}
          trendChange={isSender ? "sent" : "received"}
          trendType="up"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {isSender ? (
          <>
            <Link
              href="/triangular/search"
              className="flex flex-col gap-3 p-4 rounded-2xl border border-black/10 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
                <Search size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Find Traveler</div>
                <div className="text-xs text-slate-500 mt-0.5">Search by route</div>
              </div>
            </Link>
            <Link
              href="/buy-me"
              className="flex flex-col gap-3 p-4 rounded-2xl border border-black/10 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
                <Package size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Buy Me</div>
                <div className="text-xs text-slate-500 mt-0.5">Request a purchase</div>
              </div>
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/buy-me"
              className="flex flex-col gap-3 p-4 rounded-2xl border border-black/10 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
                <Plus size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Post Request</div>
                <div className="text-xs text-slate-500 mt-0.5">Buy Me Hub</div>
              </div>
            </Link>
            <Link
              href="/triangular/search"
              className="flex flex-col gap-3 p-4 rounded-2xl border border-black/10 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
                <Search size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-black">Find Traveler</div>
                <div className="text-xs text-slate-500 mt-0.5">Search by route</div>
              </div>
            </Link>
          </>
        )}
      </div>

      {/* My Packages */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-black">My Packages</h2>
          <button className="text-xs font-medium text-slate-500 hover:text-black transition-colors">
            See all
          </button>
        </div>

        <div className="space-y-3">
          {isLoading || isFetching ? (
            <div className="rounded-2xl border border-black/5 p-4 bg-white flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading packages...
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-black/5 p-4 bg-white text-sm text-slate-500 flex items-center gap-2">
              <AlertCircle size={14} />
              No package requests yet.
            </div>
          ) : (
            requests.map((pkg) => {
              const { label, icon: StatusIcon, color, bg } = statusConfig[pkg.status as keyof typeof statusConfig] ?? statusConfig.PENDING;
              const tripDate = pkg.trip?.departure_date
                ? new Date(pkg.trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : new Date(pkg.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const travelerName = pkg.trip?.traveler?.full_name ?? "—";
              const chatEligible = ["MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"].includes(pkg.status);

              async function handleCreateChat() {
                try {
                  const ensured = await ensureDeliveryChat({ requestId: pkg.id }).unwrap();
                  router.push(`/chat/${ensured.chat_id}`);
                } catch {
                  // no-op
                }
              }

              return (
                <div
                  key={pkg.id}
                  onClick={() => router.push(`/delivery/${pkg.id}`)}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-black/5 bg-white hover:border-black/20 transition-colors cursor-pointer"
                >
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
                    <Package size={16} className={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-black truncate">{pkg.item_description}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {pkg.pickup_city} → {pkg.dropoff_city}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusIcon size={11} className={color} />
                      <span className={`text-xs font-medium ${color}`}>{label}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{pkg.weight} kg</span>
                      {travelerName !== "—" && (
                        <>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">{travelerName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-slate-400">{tripDate}</span>
                    {pkg.chat_id && chatEligible ? (
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-black text-white hover:bg-black/80"
                        onClick={(e) => { e.stopPropagation(); router.push(`/chat/${pkg.chat_id}`); }}
                      >
                        Open Chat
                      </Button>
                    ) : chatEligible ? (
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-black text-white hover:bg-black/80"
                        onClick={(e) => { e.stopPropagation(); handleCreateChat(); }}
                        disabled={ensuringChat}
                      >
                        {ensuringChat ? <Loader2 size={14} className="animate-spin" /> : "Create Chat"}
                      </Button>
                    ) : (
                      <ChevronRight size={14} className="text-slate-300" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
