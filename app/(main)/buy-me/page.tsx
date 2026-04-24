"use client";
import { toast } from "sonner";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ShoppingBag,
  Plus,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Clock3,
  Truck,
  MessageCircle,
  Upload,
  Receipt,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Profile {
  id: string;
  role: "SENDER" | "TRAVELER" | "RECEIVER";
  full_name: string;
}

interface BuyMeRequest {
  id: string;
  receiver_id: string;
  traveler_id: string | null;
  trip_id: string | null;
  product_url: string;
  product_name: string;
  product_image: string | null;
  estimated_price: number | null;
  destination: string;
  notes: string | null;
  status: "OPEN" | "ACCEPTED" | "PURCHASED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  receiver?: {
    full_name: string;
  };
}

const statusStyles: Record<BuyMeRequest["status"], string> = {
  OPEN: "bg-slate-100 text-slate-700",
  ACCEPTED: "bg-brand-green text-white shadow-sm ring-1 ring-black/5",
  PURCHASED: "bg-slate-200 text-slate-800",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export default function BuyMePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [requests, setRequests] = useState<BuyMeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Receipt upload state
  const [receiptUrl, setReceiptUrl] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | null>(null);

  // Receiver form
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [destination, setDestination] = useState("Addis Ababa");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/buy-me-requests", {
      method: "GET",
      cache: "no-store",
    });

    if (response.status === 401) {
      router.push("/auth/login");
      return;
    }

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Could not load Buy Me requests."); toast.error(payload?.error ?? "Could not load Buy Me requests.");
      setLoading(false);
      return;
    }

    setUserId(payload?.data?.userId ?? "");
    setProfile((payload?.data?.profile as Profile) ?? null);
    setRequests((payload?.data?.requests as BuyMeRequest[]) ?? []);

    setLoading(false);
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || profile.role !== "RECEIVER") return;

    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/buy-me-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_name: productName,
        product_url: productUrl,
        destination,
        estimated_price: estimatedPrice ? Number(estimatedPrice) : null,
        notes: notes || null,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Could not create request."); toast.error(payload?.error ?? "Could not create request.");
      setSubmitting(false);
      return;
    }

    setProductName("");
    setProductUrl("");
    setDestination("Addis Ababa");
    setEstimatedPrice("");
    setNotes("");
    setSubmitting(false);
    toast.success("Request posted successfully");
    await loadData();
  }

  async function acceptRequest(requestId: string) {
    if (!profile || profile.role !== "TRAVELER") return;

    setAcceptingId(requestId);
    setError(null);

    const response = await fetch("/api/buy-me-requests/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Could not accept request."); toast.error(payload?.error ?? "Could not accept request.");
      setAcceptingId(null);
      return;
    }

    setAcceptingId(null);
    const chatId = payload?.data?.chat_id as string | undefined;
    if (chatId) {
      router.push(`/chat/${chatId}`);
      return;
    }

    await loadData();
  }

  async function uploadReceipt(requestId: string) {
    const url = receiptUrl[requestId]?.trim();
    if (!url) {
      setError("Please enter a receipt URL"); toast.error("Please enter a receipt URL");
      return;
    }

    setUploadingId(requestId);
    setError(null);

    const response = await fetch("/api/buy-me-requests/receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, receiptUrl: url }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Could not upload receipt."); toast.error(payload?.error ?? "Could not upload receipt.");
      setUploadingId(null);
      return;
    }

    setUploadingId(null);
    toast.success("Receipt uploaded. It is now marked as purchased.");
    setReceiptUrl((prev) => ({ ...prev, [requestId]: "" }));
    await loadData();
  }

  async function confirmDelivery(requestId: string) {
    setDeliveringId(requestId);
    setError(null);

    const response = await fetch("/api/buy-me-requests/receipt", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload?.error ?? "Could not confirm delivery."); toast.error(payload?.error ?? "Could not confirm delivery.");
      setDeliveringId(null);
      return;
    }

    setDeliveringId(null);
    toast.success("Delivery confirmed!");
    await loadData();
  }

  const receiverRequests = useMemo(() => requests, [requests]);
  const travelerOpen = useMemo(() => requests.filter((r) => r.status === "OPEN"), [requests]);
  const travelerMine = useMemo(
    () => requests.filter((r) => r.traveler_id === userId && r.status !== "OPEN"),
    [requests, userId]
  );

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black flex-1">Buy Me Hub</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4 space-y-4">
        {loading ? (
          <div className="h-[60vh] flex items-center justify-center text-slate-500 gap-2">
            <Loader2 size={18} className="animate-spin" />
            Loading Buy Me...
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {profile?.role === "RECEIVER" && (
              <>
                <Card className="border border-black/5 rounded-2xl shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plus size={16} /> Post a Buy Me Request
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <form onSubmit={createRequest} className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">Item name</label>
                        <Input
                          required
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          placeholder="iPhone 15 Pro Case"
                          className="h-11 rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">Product URL</label>
                        <Input
                          required
                          type="url"
                          value={productUrl}
                          onChange={(e) => setProductUrl(e.target.value)}
                          placeholder="https://..."
                          className="h-11 rounded-xl"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-500">Destination</label>
                          <Input
                            required
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            placeholder="Addis Ababa"
                            className="h-11 rounded-xl"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-500">Est. Price ($)</label>
                          <Input
                            value={estimatedPrice}
                            onChange={(e) => setEstimatedPrice(e.target.value)}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="25"
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-500">Notes (optional)</label>
                        <Textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Color, size, store preference..."
                          className="rounded-xl"
                        />
                      </div>

                      <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors">
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                        {submitting ? "Posting..." : "Post Request"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border border-black/5 rounded-2xl shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">My Requests</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {receiverRequests.length === 0 ? (
                      <p className="text-sm text-slate-500">No requests posted yet.</p>
                    ) : (
                      receiverRequests.map((r) => (
                        <div key={r.id} className="rounded-xl border border-black/10 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-black truncate">{r.product_name}</p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{r.destination}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${statusStyles[r.status]}`}>
                              {r.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                            {r.estimated_price ? <span>${Number(r.estimated_price).toFixed(2)}</span> : <span>Price TBD</span>}
                            <span>·</span>
                            <a className="inline-flex items-center gap-1 underline" href={r.product_url} target="_blank" rel="noreferrer">
                              View link <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {profile?.role === "TRAVELER" && (
              <>
                <Card className="border border-black/5 rounded-2xl shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Open Shopping Requests</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {travelerOpen.length === 0 ? (
                      <p className="text-sm text-slate-500">No open requests right now.</p>
                    ) : (
                      travelerOpen.map((r) => (
                        <div key={r.id} className="rounded-xl border border-black/10 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-black truncate">{r.product_name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">for {r.receiver?.full_name ?? "Receiver"} · {r.destination}</p>
                            </div>
                            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${statusStyles[r.status]}`}>
                              {r.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                            {r.estimated_price ? <span>${Number(r.estimated_price).toFixed(2)}</span> : <span>Price TBD</span>}
                            <span>·</span>
                            <a className="inline-flex items-center gap-1 underline" href={r.product_url} target="_blank" rel="noreferrer">
                              Open link <ExternalLink size={12} />
                            </a>
                          </div>

                          {r.notes && <p className="text-xs text-slate-500 mt-2">{r.notes}</p>}

                          <Button
                            onClick={() => acceptRequest(r.id)}
                            disabled={acceptingId === r.id}
                            className="w-full mt-3 h-10 rounded-xl bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors"
                          >
                            {acceptingId === r.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            {acceptingId === r.id ? "Accepting..." : "Accept Request"}
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-black/5 rounded-2xl shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">My Shopping Jobs</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {travelerMine.length === 0 ? (
                      <p className="text-sm text-slate-500">No accepted jobs yet.</p>
                    ) : (
                      travelerMine.map((r) => (
                        <div key={r.id} className="rounded-xl border border-black/10 p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-black truncate">{r.product_name}</p>
                            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${statusStyles[r.status]}`}>
                              {r.status}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">Destination: {r.destination}</p>

                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {r.estimated_price ? <span>${Number(r.estimated_price).toFixed(2)}</span> : <span>Price TBD</span>}
                            <span>·</span>
                            <a className="inline-flex items-center gap-1 underline" href={r.product_url} target="_blank" rel="noreferrer">
                              Product link <ExternalLink size={12} />
                            </a>
                          </div>

                          {/* ACCEPTED: Show receipt upload */}
                          {r.status === "ACCEPTED" && (
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center gap-2">
                                <Input
                                  placeholder="Paste receipt image URL..."
                                  value={receiptUrl[r.id] ?? ""}
                                  onChange={(e) => setReceiptUrl((prev) => ({ ...prev, [r.id]: e.target.value }))}
                                  className="h-9 rounded-lg text-xs flex-1"
                                />
                              </div>
                              <Button
                                onClick={() => uploadReceipt(r.id)}
                                disabled={uploadingId === r.id || !(receiptUrl[r.id]?.trim())}
                                className="w-full h-9 rounded-lg bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors text-xs"
                              >
                                {uploadingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                {uploadingId === r.id ? "Uploading..." : "Upload Receipt & Mark Purchased"}
                              </Button>
                            </div>
                          )}

                          {/* PURCHASED: Show confirm delivery */}
                          {r.status === "PURCHASED" && (
                            <Button
                              onClick={() => confirmDelivery(r.id)}
                              disabled={deliveringId === r.id}
                              className="w-full h-9 rounded-lg bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors text-xs"
                            >
                              {deliveringId === r.id ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                              {deliveringId === r.id ? "Confirming..." : "Confirm Delivery"}
                            </Button>
                          )}

                          {/* DELIVERED: Show completion */}
                          {r.status === "DELIVERED" && (
                            <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                              <CheckCircle2 size={14} />
                              Delivered successfully
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {profile?.role === "SENDER" && (
              <Card className="border border-black/5 rounded-2xl shadow-none">
                <CardContent className="p-5 text-center">
                  <ShoppingBag size={28} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">Buy Me is available for Receivers and Travelers.</p>
                  <p className="text-xs text-slate-500 mt-1">Switch role to receiver to post requests.</p>
                </CardContent>
              </Card>
            )}

            <Card className="border border-black/5 rounded-2xl shadow-none">
              <CardContent className="p-3">
                <Link href="/chat" className="flex items-center justify-between text-sm text-black py-1">
                  <span className="inline-flex items-center gap-2"><MessageCircle size={15} /> Go to chats</span>
                  <span className="text-slate-400">→</span>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
