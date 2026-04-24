"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Plane, ChevronRight, ArrowLeft, SlidersHorizontal, Star, CalendarIcon, Loader2 } from "lucide-react"
import Link from "next/link";
import { format, parseISO, startOfToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { useLazySearchTripsQuery, type TripSearchItem } from "@/lib/redux/api";

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
];

const ANY_CITY = "__any__";

export default function TravelerSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <TravelerSearchContent />
    </Suspense>
  );
}

function TravelerSearchContent() {
  const searchParams = useSearchParams();
  const initialFrom = searchParams.get("from") ?? "";
  const initialTo = searchParams.get("to") ?? "Addis Ababa";

  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [date, setDate] = useState("");
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<TripSearchItem[]>([]);
  const [searchTrips, { isFetching: loading }] = useLazySearchTripsQuery();
  const autoSearched = useRef(false);

  /* Auto-search when arriving from hero with pre-filled params */
  useEffect(() => {
    if (autoSearched.current) return;
    const paramFrom = searchParams.get("from");
    const paramTo = searchParams.get("to");
    if (paramFrom || paramTo) {
      autoSearched.current = true;
      doSearch(paramFrom ?? "", paramTo ?? "Addis Ababa", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(f: string, t: string, d: string) {
    setSearched(true);
    try {
      const trips = await searchTrips({
        from: f && f !== ANY_CITY ? f : undefined,
        to: t && t !== ANY_CITY ? t : undefined,
        date: d || undefined,
      }).unwrap();
      setResults(trips);
    } catch {
      setResults([]);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch(from, to, date);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black flex-1">Find a Traveler</h1>
        <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <SlidersHorizontal size={16} className="text-black" />
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6">
        {/* Search form */}
        <form onSubmit={handleSearch} className="space-y-3 mb-6">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Select departure city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CITY}>Any city</SelectItem>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CITY}>Any city</SelectItem>
                {CITIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date (optional)</label>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full h-11 justify-start rounded-xl border border-black/10 bg-slate-50 px-4 text-left font-normal shadow-sm"
                  />
                }
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
                {date ? format(parseISO(date), "PPP") : <span className="text-slate-400">Pick a date</span>}
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto overflow-hidden rounded-2xl border border-black/10 bg-white p-0 shadow-xl"
              >
                <Calendar
                  mode="single"
                  selected={date ? parseISO(date) : undefined}
                  onSelect={(selectedDate) => {
                    if (selectedDate) {
                      setDate(format(selectedDate, "yyyy-MM-dd"));
                    } else {
                      setDate("");
                    }
                  }}
                  disabled={{ before: startOfToday() }}
                  className="w-full p-3"
                  classNames={{
                    root: "w-full",
                    months: "flex flex-col gap-3",
                    month: "w-full space-y-3",
                    nav: "absolute inset-x-3 top-3 flex items-center justify-between",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm font-semibold",
                    table: "w-full border-collapse",
                    head_row: "flex",
                    head_cell: "w-9 text-[0.72rem] font-medium text-slate-500",
                    row: "flex w-full mt-1",
                    cell: "h-9 w-9 p-0 text-center",
                    day: "h-9 w-9 rounded-full p-0 text-sm font-normal aria-selected:opacity-100 hover:bg-slate-100 hover:text-slate-900",
                    day_selected: "bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-black hover:text-white focus:bg-black focus:text-white",
                    day_today: "bg-slate-100 text-black",
                    day_outside: "text-slate-300 opacity-50 aria-selected:text-slate-300 aria-selected:opacity-40",
                    day_disabled: "text-slate-300 opacity-50",
                    day_range_middle: "aria-selected:bg-slate-100 aria-selected:text-slate-900",
                    day_hidden: "invisible",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-brand-green text-white shadow-sm ring-1 ring-black/5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-greenLight transition-colors transition-colors disabled:opacity-50"
          >
            <Search size={16} />
            {loading ? "Searching…" : "Search Travelers"}
          </button>
        </form>

        {/* Results */}
        {searched && !loading && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-black">
                {results.length > 0 ? `${results.length} traveler${results.length !== 1 ? "s" : ""} found` : "No travelers found"}
              </h2>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Plane size={24} className="text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">No travelers on this route yet</p>
                <p className="text-xs text-slate-400 mt-1">Try different dates or cities</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((trip) => (
                  <Link
                    key={trip.id}
                    href={`/triangular/${trip.id}`}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-black/5 bg-white hover:border-black/20 transition-colors"
                  >
                    {/* Avatar placeholder */}
                    <div className="w-11 h-11 bg-brand-green rounded-full shadow-sm text-white flex items-center justify-center shrink-0">
                      <span className="text-white font-bold text-sm">
                        {trip.profiles?.full_name?.[0] ?? "?"}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-black">
                          {trip.profiles?.full_name ?? "Traveler"}
                        </span>
                        {trip.profiles?.verified && (
                          <span className="text-[10px] font-bold bg-brand-green text-white shadow-sm ring-1 ring-black/5 px-1.5 py-0.5 rounded-full">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {trip.departure_city} → {trip.destination_city}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">
                          {new Date(trip.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{trip.flight_number}</span>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs text-slate-400">{trip.available_weight} kg free</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-bold text-black">${trip.price_per_kg}/kg</span>
                      {trip.profiles?.rating && (
                        <div className="flex items-center gap-0.5">
                          <Star size={10} className="text-black fill-black" />
                          <span className="text-xs text-slate-500">{trip.profiles.rating.toFixed(1)}</span>
                        </div>
                      )}
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state before search */}
        {!searched && (
          <div className="text-center py-16">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Search size={24} className="text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Search for travelers</p>
            <p className="text-xs text-slate-400 mt-1">Find someone flying your route</p>
          </div>
        )}
      </main>
    </div>
  );
}