"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plane, Loader2, Plus, Calendar, AlertCircle } from "lucide-react";
import { useGetMyTripsQuery } from "@/lib/redux/api";
import { format } from "date-fns";

export default function MyTripsPage() {
  const router = useRouter();
  const { data: trips, isLoading, error } = useGetMyTripsQuery();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-black" />
          </Link>
          <h1 className="text-base font-bold text-black">My Trips</h1>
        </div>
        <Link href="/traveler/flight-entry" className="w-8 h-8 flex items-center justify-center rounded-full bg-brand-green text-white shadow-sm hover:bg-brand-green/90 transition-colors">
          <Plus size={18} />
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Upcoming Flights</h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm">
            Failed to load trips.
          </div>
        ) : trips?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Plane size={48} className="text-slate-200 mb-4" />
            <p className="text-sm font-medium text-slate-600">No active trips</p>
            <p className="text-xs mt-1">List a flight to start accepting deliveries.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {trips?.map((trip) => (
              <div
                key={trip.id}
                onClick={() => router.push(`/traveler/trips/${trip.id}`)}
                className="bg-white border border-black/5 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-brand-green/20 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                      <Plane size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-black">{trip.departure_city} → {trip.destination_city}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar size={12} />
                        {format(new Date(trip.departure_date), "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-full text-slate-600">
                    {trip.trip_type === "BUY_ME" ? "Buy Me" : "Triangular"}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm py-3 border-t border-black/5 mt-2">
                  <div className="text-slate-500 text-xs">
                    Flight <span className="font-semibold text-black">{trip.flight_number}</span>
                  </div>
                  <div className="text-slate-500 text-xs">
                    {trip.available_weight}kg available · <span className="font-semibold text-black">${trip.price_per_kg}/kg</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
