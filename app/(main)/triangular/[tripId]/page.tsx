"use client";
import { toast } from "sonner";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, PackageCheck } from "lucide-react";
import TripDetail from "@/components/triangular/TripDetail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateDeliveryRequestMutation,
  useGetTripByIdQuery,
} from "@/lib/redux/api";

export default function TravelerDetailPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;
  const router = useRouter();

  const { data: trip, isLoading: loading } = useGetTripByIdQuery(tripId ?? "", {
    skip: !tripId,
  });
  const [createDeliveryRequest, { isLoading: submitting }] = useCreateDeliveryRequestMutation();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [itemDescription, setItemDescription] = useState("");
  const [weight, setWeight] = useState("1");
  const [pickupCity, setPickupCity] = useState("");
  const [dropoffCity, setDropoffCity] = useState("");

  const tripData = trip ?? null;

  useEffect(() => {
    if (!tripData) return;
    setPickupCity((current) => current || tripData.departure_city);
    setDropoffCity((current) => current || tripData.destination_city);
  }, [tripData]);

  async function createDeliveryRequestAction(e: React.FormEvent) {
    e.preventDefault();

    if (!tripData) return;

    setError(null);
    setSuccessMessage(null);

    const weightNumber = Number(weight);
    if (!itemDescription.trim()) {
      setError("Please add an item description."); toast.error("Please add an item description.");
      return;
    }

    if (!weightNumber || weightNumber <= 0) {
      setError("Please enter a valid package weight."); toast.error("Please enter a valid package weight.");
      return;
    }

    try {
      const result = await createDeliveryRequest({
        tripId: tripData.id,
        itemDescription: itemDescription.trim(),
        weight: weightNumber,
        pickupCity: pickupCity.trim() || tripData.departure_city,
        dropoffCity: dropoffCity.trim() || tripData.destination_city,
      }).unwrap();

      setSuccessMessage(`Request created (${result.id.slice(0, 8)}). Opening delivery details...`);
      setItemDescription("");
      setWeight("1");
      toast.success("Delivery request created");
      router.push(`/delivery/${result.id}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create request.";
      setError(message); toast.error(message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading traveler details...
        </div>
      </div>
    );
  }

  if (!tripData) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
          <Link href="/triangular/search" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-black" />
          </Link>
          <h1 className="text-base font-bold text-black">Traveler Detail</h1>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-8">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm font-medium text-black">Trip not found</p>
              <p className="text-xs text-slate-500 mt-1">It may be closed or unavailable.</p>
              <Link href="/triangular/search" className="inline-flex mt-4 text-sm font-medium text-black underline">
                Back to search
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link href="/triangular/search" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black flex-1">Traveler Detail</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4 space-y-4">
        <TripDetail trip={tripData} />

        {tripData.notes && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trip Notes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              {tripData.notes}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-black/5 bg-white shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackageCheck size={16} />
              Create Delivery Request
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={createDeliveryRequestAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Item description</label>
                <Textarea
                  required
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Documents, electronics, gifts..."
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <label className="text-xs font-medium text-slate-500">Weight (kg)</label>
                  <Input
                    required
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium text-slate-500">Pickup city</label>
                  <Input
                    required
                    value={pickupCity}
                    onChange={(e) => setPickupCity(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Dropoff city</label>
                <Input
                  required
                  value={dropoffCity}
                  onChange={(e) => setDropoffCity(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700">
                  {successMessage}
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full h-11 rounded-xl bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors">
                {submitting ? <Loader2 size={16} className="animate-spin" /> : "Send Request"}
              </Button>
            </form>

            <Link href="/chat" className="inline-flex mt-3 text-xs text-slate-500 hover:text-black transition-colors">
              Open chats
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
