"use client";
import { toast } from "sonner";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plane,
  Loader2,
  CheckCircle2,
  Calendar as CalendarIcon,
} from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";


const CITIES = [
  "Addis Ababa",
  "Washington D.C.",
  "New York",
  "Los Angeles",
  "London",
  "Dubai",
  "Beijing",
  "Shanghai",
  "Toronto",
  "Frankfurt",
  "Paris",
  "Rome",
  "Stockholm",
];

export default function FlightEntryPage() {
  const router = useRouter();
  const [flightNumber, setFlightNumber] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [departureDate, setDepartureDate] = useState<Date | undefined>(
    undefined,
  );
  const [availableWeight, setAvailableWeight] = useState("10");
  const [pricePerKg, setPricePerKg] = useState("5");
  const [notes, setNotes] = useState("");
  const [tripType, setTripType] = useState<"TRIANGULAR" | "BUY_ME">(
    "TRIANGULAR",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!departureDate) {
      setError("Please select a departure date."); toast.error("Please select a departure date.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_type: tripType,
        flight_number: flightNumber,
        departure_city: departureCity,
        destination_city: destinationCity,
        departure_date: departureDate ? format(departureDate, "yyyy-MM-dd") : null,
        available_weight: parseFloat(availableWeight),
        price_per_kg: parseFloat(pricePerKg),
        notes: notes || null,
      }),
    });

    const payload = await response.json();

    if (response.status === 401) {
      router.push("/auth/login");
      return;
    }

    if (!response.ok) {
      setError(payload?.error ?? "Could not create trip"); toast.error(payload?.error ?? "Could not create trip");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      toast.success("Flight listed successfully");
      router.push("/dashboard");
    }, 1800);
  }

  if (success) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 bg-brand-green rounded-full shadow-sm text-white flex items-center justify-center mb-6">
          <CheckCircle2 size={28} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold text-black mb-2">Trip Listed!</h2>
        <p className="text-slate-500 text-sm text-center">
          Your flight has been posted. Senders can now find and request you.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link
          href="/dashboard"
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black">List Your Trip</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6">
        {/* Icon */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center">
            <Plane size={22} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-black">Flight Details</div>
            <div className="text-xs text-slate-500">
              Tell us about your upcoming trip
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Trip type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-black">Trip Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(["TRIANGULAR", "BUY_ME"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTripType(type)}
                  className={`h-11 rounded-xl border-2 text-sm font-semibold transition-all ${
                    tripType === type
                      ? "border-black bg-brand-green text-white shadow-sm ring-1 ring-black/5"
                      : "border-black/10 bg-slate-50 text-black hover:border-black/30"
                  }`}
                >
                  {type === "TRIANGULAR" ? "Triangular" : "Buy Me"}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {tripType === "TRIANGULAR"
                ? "3-party delivery: Sender → You → Receiver"
                : "2-party: You buy & deliver items for Receivers"}
            </p>
          </div>

          {/* Flight number */}
          <div className="space-y-1.5">
            <label
              className="text-sm font-medium text-black"
              htmlFor="flightNumber"
            >
              Flight Number
            </label>
            <input
              id="flightNumber"
              type="text"
              required
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
              placeholder="ET 509"
              className="w-full h-11 px-4 rounded-xl border border-black/10 bg-slate-50 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition uppercase"
            />
          </div>

          {/* Departure city */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-black">
              Departure City
            </label>
            <Select
              required
              value={departureCity}
              onValueChange={setDepartureCity}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Select city…" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination city */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-black">
              Destination City
            </label>
            <Select
              required
              value={destinationCity}
              onValueChange={setDestinationCity}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Select city…" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Departure date */}
          <div className="space-y-1.5">
            <FieldLabel htmlFor="date-picker-optional">
              {" "}
              Departure Date
            </FieldLabel>

            <Popover>
              <PopoverTrigger>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full h-11 justify-start text-left font-normal rounded-xl border-black/10 bg-white px-4",
                    !departureDate && "text-slate-400",
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {departureDate
                    ? format(departureDate, "PPP")
                    : "Pick a departure date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] max-w-sm p-0 sm:w-auto sm:max-w-none"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={departureDate}
                  onSelect={setDepartureDate}
                  disabled={(date) =>
                    date < new Date(new Date().setHours(0, 0, 0, 0))
                  }
                  initialFocus
                  className="rounded-xl bg-white w-72 p-3 shadow-lg [--cell-size:--spacing(9)]"
                  classNames={{
                    today:
                      "rounded-lg bg-gray-300 text-white font-semibold text-black data-[selected=true]:rounded-full data-[selected=true]:bg-black data-[selected=true]:text-white",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Weight & Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                className="text-sm font-medium text-black"
                htmlFor="weight"
              >
                Available Weight (kg)
              </label>
              <input
                id="weight"
                type="number"
                required
                min="0.5"
                max="30"
                step="0.5"
                value={availableWeight}
                onChange={(e) => setAvailableWeight(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-black/10 bg-slate-50 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-black" htmlFor="price">
                Price per kg ($)
              </label>
              <input
                id="price"
                type="number"
                required
                min="0"
                step="0.5"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-black/10 bg-slate-50 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-black" htmlFor="notes">
              Notes{" "}
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any restrictions or preferences…"
              className="w-full px-4 py-3 rounded-xl border border-black/10 bg-slate-50 text-sm text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-brand-green text-white shadow-sm ring-1 ring-black/5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-greenLight transition-colors transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "List My Trip"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
