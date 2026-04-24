"use client";
import { toast } from "sonner";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plane, Loader2, Calendar, AlertCircle, XCircle } from "lucide-react";
import { useGetTripByIdQuery, useCancelTripMutation } from "@/lib/redux/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function TripManagementPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  
  const { data: trip, isLoading, error } = useGetTripByIdQuery(tripId);
  const [cancelTrip, { isLoading: isCanceling }] = useCancelTripMutation();

  const handleCancelTrip = async () => {
    try {
      await cancelTrip(tripId).unwrap();
      toast.success("Trip cancelled");
      router.push("/traveler/trips");
    } catch (err) {
      console.error("Failed to cancel trip:", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/traveler/trips" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-black" />
          </Link>
          <h1 className="text-base font-bold text-black">Manage Trip</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : error || !trip ? (
          <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm">
            Failed to load trip details. It may have been deleted.
          </div>
        ) : (
          <>
            <div className="bg-white border border-black/5 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                    Route
                  </div>
                  <div className="text-lg font-bold text-black flex items-center gap-2">
                    {trip.departure_city} 
                    <Plane size={16} className="text-slate-400" />
                    {trip.destination_city}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                    Date
                  </div>
                  <div className="text-sm font-semibold text-black">
                    {format(new Date(trip.departure_date), "MMM d, yyyy")}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-4 border-t border-black/5">
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Flight Number</div>
                  <div className="text-sm font-semibold text-black">{trip.flight_number}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Available Weight</div>
                  <div className="text-sm font-semibold text-black">{trip.available_weight} kg</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Price Per kg</div>
                  <div className="text-sm font-semibold text-brand-green">${trip.price_per_kg}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Type</div>
                  <div className="text-sm font-semibold text-black">
                    {trip.trip_type === "BUY_ME" ? "Buy Me" : "Triangular"}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-red-600 mb-2">Danger Zone</h3>
              <p className="text-xs text-slate-500 mb-4">
                If you cancel this trip, any incoming delivery requests will be voided. You cannot undo this action.
              </p>
              <Button
                variant="outline"
                onClick={handleCancelTrip}
                disabled={isCanceling}
                className="w-full h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {isCanceling ? <Loader2 size={16} className="animate-spin mr-2" /> : <XCircle size={16} className="mr-2" />}
                {isCanceling ? "Canceling..." : "Cancel Trip"}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
