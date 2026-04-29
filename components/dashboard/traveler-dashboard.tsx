"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plane, DollarSign, Package, Loader2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { DashboardMetricCard } from "@/components/ui/dashboard-overview";
import { Button } from "@/components/ui/button";
import {
  useAcceptDeliveryRequestMutation,
  useEnsureDeliveryChatMutation,
  useCancelDeliveryRequestMutation,
  useGetDashboardStatsQuery,
  useGetTravelerDeliveryRequestsQuery,
} from "@/lib/redux/api";

interface Profile {
  id: string;
  full_name: string;
  role: string;
  rating: number;
  verified: boolean;
}

interface TravelerDashboardProps {
  profile: Profile;
}

export function TravelerDashboard({ profile: _profile }: TravelerDashboardProps) {
  const router = useRouter();
  const { data: requests = [], isLoading, isFetching } = useGetTravelerDeliveryRequestsQuery();
  const { data: stats } = useGetDashboardStatsQuery();
  const [acceptDeliveryRequest, { isLoading: accepting }] = useAcceptDeliveryRequestMutation();
  const [ensureDeliveryChat, { isLoading: ensuringChat }] = useEnsureDeliveryChatMutation();
  const [cancelDeliveryRequest, { isLoading: cancelling }] = useCancelDeliveryRequestMutation();

  const pendingCount = requests.filter((request) => request.status === "PENDING").length;
  const activeRequests = requests.filter((request) =>
    ["MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"].includes(request.status),
  );
  const completedRequests = requests.filter((request) => request.status === "DELIVERED");
  const actionableRequests = requests.filter((request) =>
    ["PENDING", "MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED"].includes(request.status),
  );
  const dashboardStats = stats ?? {
    total: requests.length,
    pending: pendingCount,
    active: activeRequests.length,
    delivered: completedRequests.length,
    cancelled: requests.filter((request) => request.status === "CANCELLED").length,
    projected: requests
      .filter((request) => request.status !== "CANCELLED")
      .reduce((sum, request) => sum + request.weight * request.trip.price_per_kg, 0),
    earned: completedRequests.reduce(
      (sum, request) => sum + request.weight * request.trip.price_per_kg,
      0,
    ),
  };

  async function handleAccept(requestId: string) {
    try {
      const response = await acceptDeliveryRequest({ requestId }).unwrap();
      if (response.chat_id) {
        router.push(`/chat/${response.chat_id}`);
        return;
      }

      const ensured = await ensureDeliveryChat({ requestId }).unwrap();
      router.push(`/chat/${ensured.chat_id}`);
    } catch {
      // Keep UI simple; request list will remain unchanged on error.
    }
  }

  async function handleCreateChat(requestId: string) {
    try {
      const ensured = await ensureDeliveryChat({ requestId }).unwrap();
      router.push(`/chat/${ensured.chat_id}`);
    } catch {
      // no-op
    }
  }

  async function handleReject(requestId: string) {
    try {
      await cancelDeliveryRequest(requestId).unwrap();
    } catch {
      // ignore errors; UI will refresh via invalidation
    }
  }

  return (
    <div className="space-y-6">
      {/* Earnings summary - Using DashboardMetricCard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DashboardMetricCard
          title="Earned"
          value={`$${dashboardStats.earned.toFixed(2)}`}
          icon={DollarSign}
          trendChange={`${dashboardStats.delivered} delivered`}
          trendType="neutral"
        />
        <DashboardMetricCard
          title="Projected"
          value={`$${dashboardStats.projected.toFixed(2)}`}
          icon={TrendingUp}
          trendChange={`${dashboardStats.active} active`}
          trendType={dashboardStats.active > 0 ? "up" : "neutral"}
        />
        <DashboardMetricCard
          title="Requests"
          value={String(dashboardStats.total)}
          icon={Package}
          trendChange={`${dashboardStats.pending} pending`}
          trendType={dashboardStats.pending > 0 ? "up" : "neutral"}
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/traveler/trips"
          className="flex flex-col gap-3 p-4 rounded-2xl border border-black/10 bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="w-9 h-9 bg-brand-green rounded-xl flex items-center justify-center shadow-sm">
            <Plane size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-black">My Trips</div>
            <div className="text-xs text-slate-500 mt-0.5">Manage flights</div>
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
            <div className="text-sm font-semibold text-black">Buy Me Hub</div>
            <div className="text-xs text-slate-500 mt-0.5">Shopping requests</div>
          </div>
        </Link>
      </div>

      {/* Delivery work */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-black">Delivery Work</h2>
          <span className="text-xs font-medium text-slate-500">
            {pendingCount} pending · {activeRequests.length} active
          </span>
        </div>

        <div className="space-y-3">
          {isLoading || isFetching ? (
            <div className="rounded-2xl border border-black/5 p-4 bg-white flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading requests...
            </div>
          ) : actionableRequests.length === 0 ? (
            <div className="rounded-2xl border border-black/5 p-4 bg-white text-sm text-slate-500 flex items-center gap-2">
              <AlertCircle size={14} />
              No pending or active requests for your trips yet.
            </div>
          ) : (
            actionableRequests.map((req) => {
              const estimatedPay = req.weight * req.trip.price_per_kg;

              return (
                <div
                  key={req.id}
                  onClick={() => router.push(`/delivery/${req.id}`)}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-black/5 bg-white shadow-sm hover:shadow-md hover:border-brand-green/20  transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    <Plane size={16} className="text-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-black truncate">{req.item_description}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {req.pickup_city} → {req.dropoff_city}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-slate-400">{req.weight} kg</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">Flight {req.trip.flight_number}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">from {req.sender?.full_name ?? "Sender"}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-sm font-bold text-black">${estimatedPay.toFixed(2)}</span>
                  {req.status !== "PENDING" && req.chat_id ? (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); router.push(`/chat/${req.chat_id}`); }}
                        className="h-8 rounded-lg bg-black text-white hover:bg-black/80"
                      >
                        Open Chat
                      </Button>
                    ) : req.status !== "PENDING" ? (
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleCreateChat(req.id); }}
                        disabled={ensuringChat}
                        className="h-8 rounded-lg bg-black text-white hover:bg-black/80"
                      >
                        {ensuringChat ? <Loader2 size={14} className="animate-spin" /> : "Create Chat"}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleAccept(req.id); }}
                          disabled={accepting || ensuringChat}
                          className="h-8 rounded-lg bg-black text-white hover:bg-black/80"
                        >
                          {accepting && <Loader2 size={14} className="animate-spin" />}
                          Accept
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleReject(req.id); }}
                          disabled={cancelling}
                          className="h-8 rounded-lg"
                        >
                          {cancelling ? <Loader2 size={14} className="animate-spin" /> : "Reject"}
                        </Button>
                      </div>
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
