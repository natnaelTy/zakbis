"use client";
import { toast } from "sonner";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Plane,
  User,
  Star,
  ShieldCheck,
  MessageCircle,
  Loader2,
  ChevronRight,
  MapPin,
  Weight,
  Calendar,
  AlertCircle,
  XCircle,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TrackingStepper } from "@/components/triangular/TrackingStepper";
import {
  useGetDeliveryRequestByIdQuery,
  useAdvanceDeliveryStatusMutation,
  useEnsureDeliveryChatMutation,
  useCancelDeliveryRequestMutation,
} from "@/lib/redux/api";

const STATUS_ACTION_LABELS: Record<string, { label: string; description: string }> = {
  MATCHED: { label: "Mark as Picked Up", description: "Confirm you've picked up the package from the sender" },
  PICKED_UP: { label: "Start Transit", description: "Package is now in transit with you" },
  IN_TRANSIT: { label: "Mark Arrived", description: "You've arrived at the destination city" },
  ARRIVED: { label: "Confirm Delivery", description: "Package has been delivered to the receiver" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

function PersonCard({
  label,
  name,
  rating,
  verified,
}: {
  label: string;
  name: string;
  rating?: number;
  verified?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-black/5 bg-slate-50">
      <div className="w-10 h-10 rounded-full bg-brand-green text-white shadow-sm ring-1 ring-black/5 flex items-center justify-center text-sm font-bold shrink-0">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-black truncate">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {rating != null && rating > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Star size={10} className="text-black" />
              {Number(rating).toFixed(1)}
            </span>
          )}
          {verified && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <ShieldCheck size={10} className="text-black" />
              Verified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingPersonCard({ label, requestId }: { label: string; requestId: string }) {
  const [copied, setCopied] = useState(false);
  
  function handleCopy() {
    const url = `${window.location.origin}/invite/delivery/${requestId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
          <User size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Missing {label}</p>
          <p className="text-sm font-medium text-slate-600">Waiting for {label.toLowerCase()} to join</p>
        </div>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        className="w-full text-xs h-9 border-brand-green/20 text-brand-green hover:bg-brand-green/5"
        onClick={handleCopy}
      >
        {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
        {copied ? "Invite Link Copied!" : `Copy ${label} Invite Link`}
      </Button>
    </div>
  );
}

export default function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const router = useRouter();
  const { data: delivery, isLoading, error } = useGetDeliveryRequestByIdQuery(requestId);
  const [advanceStatus, { isLoading: advancing }] = useAdvanceDeliveryStatusMutation();
  const [ensureChat, { isLoading: ensuringChat }] = useEnsureDeliveryChatMutation();
  const [cancelRequest, { isLoading: cancelling }] = useCancelDeliveryRequestMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleAdvance() {
    setActionError(null);
    try {
      const result = await advanceStatus(requestId).unwrap();
      toast.success(`Delivery marked ${result.status.replaceAll("_", " ").toLowerCase()}`);
    } catch (err: any) {
      setActionError(err?.data?.error ?? "Failed to advance status"); toast.error(err?.data?.error ?? "Failed to advance status");
    }
  }

  async function handleOpenChat() {
    if (delivery?.chat_id) {
      router.push(`/chat/${delivery.chat_id}`);
      return;
    }
    try {
      const result = await ensureChat({ requestId }).unwrap();
      router.push(`/chat/${result.chat_id}`);
    } catch {
      // no-op
    }
  }

  const statusLower = delivery?.status?.toLowerCase() as any;
  const actionConfig = delivery ? STATUS_ACTION_LABELS[delivery.status] : null;
  const chatEligible = delivery
    ? ["MATCHED", "PICKED_UP", "IN_TRANSIT", "ARRIVED", "DELIVERED"].includes(delivery.status)
    : false;
  const canCancel = delivery
    ? delivery.status === "PENDING" && !delivery.is_traveler
    : false;

  async function handleCancel() {
    setActionError(null);
    try {
      await cancelRequest(requestId).unwrap();
      toast.success("Request cancelled");
      router.push("/dashboard");
    } catch (err: any) {
      setActionError(err?.data?.error ?? "Failed to cancel request"); toast.error(err?.data?.error ?? "Failed to cancel request");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-black" />
        </button>
        <h1 className="text-base font-bold text-black flex-1">Delivery Details</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4 space-y-4">
        {isLoading ? (
          <div className="h-[60vh] flex items-center justify-center text-slate-500 gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading delivery...
          </div>
        ) : error || !delivery ? (
          <div className="h-[60vh] flex flex-col items-center justify-center text-slate-500 gap-3">
            <AlertCircle size={32} className="text-slate-300" />
            <p className="text-sm font-medium">Delivery request not found</p>
            <Link href="/dashboard" className="text-sm text-black underline">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <>
            {/* Tracking Stepper */}
            <TrackingStepper
              status={statusLower}
              deliveryType="triangular"
              className="shadow-none rounded-2xl"
            />

            {/* Traveler action button */}
            {delivery.is_traveler && actionConfig && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-black">{actionConfig.label}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{actionConfig.description}</p>
                  </div>
                  {actionError && (
                    <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                      {actionError}
                    </div>
                  )}
                  <Button
                    onClick={handleAdvance}
                    disabled={advancing}
                    className="w-full h-11 rounded-xl bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors"
                  >
                    {advancing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    {advancing ? "Updating..." : actionConfig.label}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Chat button */}
            {chatEligible && (
              <Button
                onClick={handleOpenChat}
                disabled={ensuringChat}
                variant="outline"
                className="w-full h-11 rounded-xl border-black/10 text-black hover:bg-slate-50"
              >
                {ensuringChat ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <MessageCircle size={16} />
                )}
                {delivery.chat_id ? "Open Group Chat" : "Create Group Chat"}
              </Button>
            )}

            {/* Package info */}
            <Card className="border border-black/5 rounded-2xl shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package size={16} />
                  Package Info
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-black">{delivery.item_description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin size={13} className="text-black shrink-0" />
                    <span>{delivery.pickup_city} → {delivery.dropoff_city}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Weight size={13} className="text-black shrink-0" />
                    <span>{delivery.weight} kg</span>
                  </div>
                </div>
                {delivery.trip && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar size={13} className="text-black shrink-0" />
                    <span>
                      {new Date(delivery.trip.departure_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {delivery.trip && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Estimated cost</span>
                      <span className="font-bold text-black">
                        ${(delivery.weight * delivery.trip.price_per_kg).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Flight info */}
            {delivery.trip && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Plane size={16} />
                    Flight Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Flight</span>
                    <span className="font-semibold text-black">{delivery.trip.flight_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Route</span>
                    <span className="font-semibold text-black">
                      {delivery.trip.departure_city} → {delivery.trip.destination_city}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Rate</span>
                    <span className="font-semibold text-black">
                      ${Number(delivery.trip.price_per_kg).toFixed(2)}/kg
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* People */}
            <Card className="border border-black/5 rounded-2xl shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User size={16} />
                  People
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {delivery.sender && (
                  <PersonCard
                    label="Sender"
                    name={delivery.sender.full_name}
                    rating={delivery.sender.rating}
                    verified={delivery.sender.verified}
                  />
                )}
                {!delivery.sender && (
                  <MissingPersonCard label="Sender" requestId={requestId} />
                )}
                {delivery.trip?.traveler && (
                  <PersonCard
                    label="Traveler"
                    name={delivery.trip.traveler.full_name}
                    rating={delivery.trip.traveler.rating}
                    verified={delivery.trip.traveler.verified}
                  />
                )}
                {delivery.receiver && (
                  <PersonCard
                    label="Receiver"
                    name={delivery.receiver.full_name}
                    rating={delivery.receiver.rating}
                    verified={delivery.receiver.verified}
                  />
                )}
                {!delivery.receiver && (
                  <MissingPersonCard label="Receiver" requestId={requestId} />
                )}
              </CardContent>
            </Card>

            {/* Timestamps */}
            <Card className="border border-black/5 rounded-2xl shadow-none">
              <CardContent className="p-4 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Created{" "}
                  {new Date(delivery.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span>
                  Updated{" "}
                  {new Date(delivery.updated_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </CardContent>
            </Card>

            {/* Cancel button for PENDING requests */}
            {canCancel && (
              <Card className="border border-red-100">
                <CardContent className="p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-bold text-red-600">Cancel Request</h3>
                    <p className="text-xs text-slate-500 mt-0.5">This will permanently cancel your delivery request.</p>
                  </div>
                  {actionError && (
                    <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                      {actionError}
                    </div>
                  )}
                  <Button
                    onClick={handleCancel}
                    disabled={cancelling}
                    variant="outline"
                    className="w-full h-10 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                  >
                    {cancelling ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <XCircle size={14} />
                    )}
                    {cancelling ? "Cancelling..." : "Cancel This Request"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
