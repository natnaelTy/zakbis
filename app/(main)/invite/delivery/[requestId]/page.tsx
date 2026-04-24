"use client";
import { toast } from "sonner";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function InviteDeliveryPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleJoin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/delivery-requests/${requestId}/join`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Could not join delivery");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/delivery/${requestId}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message); toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm border-black/5 shadow-lg rounded-2xl">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-green/10 rounded-full flex items-center justify-center mx-auto mb-2 text-brand-green">
            {success ? <CheckCircle2 size={32} /> : <Package size={32} />}
          </div>
          <h1 className="text-lg font-bold text-black">
            {success ? "You're In!" : "Delivery Invitation"}
          </h1>
          <p className="text-sm text-slate-500">
            {success
              ? "Taking you to the delivery..."
              : "You've been invited to participate in a delivery request. Join to track progress and chat with the team."}
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-xl justify-center">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!success && (
            <div className="pt-4 space-y-2">
              <Button
                onClick={handleJoin}
                disabled={loading}
                className="w-full h-11 rounded-xl bg-brand-green text-white hover:bg-brand-greenLight transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? "Joining..." : "Accept Invitation"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => router.push("/dashboard")}
                disabled={loading}
                className="w-full h-11 rounded-xl"
              >
                Decline
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
