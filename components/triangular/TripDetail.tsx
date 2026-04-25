import React from "react";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Displays detailed information about a triangular trip.
 * The `trip` prop matches the shape selected in the page component:
 *   id: string;
 *   flight_number: string;
 *   departure_city: string;
 *   destination_city: string;
 *   departure_date: string; // ISO date
 *   available_weight: number;
 *   price_per_kg: number;
 *   profiles: { full_name: string; rating: number; verified: boolean };
 */
export default function TripDetail({ trip }: { trip: any }) {
  return (
    <Card>
      <CardContent className="p-4">
      <div className="flex items-center gap-4">
        {/* Avatar placeholder */}
        <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-lg">
          {trip.profiles?.full_name?.[0] ?? "?"}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-black">
            {trip.profiles?.full_name ?? "Traveler"}
          </h2>
          {trip.profiles?.verified && (
            <span className="inline-flex items-center gap-1 bg-black text-white text-xs font-medium px-2 py-0.5 rounded-full mt-1">
              Verified
            </span>
          )}
        </div>
        {trip.profiles?.rating && (
          <div className="flex items-center gap-0.5">
            <Star size={14} className="text-black fill-black" />
            <span className="text-sm text-slate-600">{trip.profiles.rating.toFixed(1)}</span>
          </div>
        )}
      </div>
      <div className="mt-4 text-sm text-slate-500">
        <p>{trip.departure_city} → {trip.destination_city}</p>
        <p className="mt-1">{new Date(trip.departure_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
        <p className="mt-1">Flight: {trip.flight_number}</p>
        <p className="mt-1">Available: {trip.available_weight} kg • ${trip.price_per_kg}/kg</p>
      </div>
      </CardContent>
    </Card>
  );
}
