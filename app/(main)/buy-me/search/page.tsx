"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, ShoppingBag, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { useLazySearchBuyMeQuery } from "@/lib/redux/api";
import { Button } from "@/components/ui/button";

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

export default function BuyMeSearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <BuyMeSearchContent />
    </Suspense>
  );
}

function BuyMeSearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialDestination = searchParams.get("destination") ?? "Addis Ababa";

  const [destination, setDestination] = useState(initialDestination);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searchBuyMe, { isFetching: loading }] = useLazySearchBuyMeQuery();
  const autoSearched = useRef(false);

  /* Auto-search on mount */
  useEffect(() => {
    if (autoSearched.current) return;
    autoSearched.current = true;
    doSearch(destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(dest: string) {
    setSearched(true);
    try {
      const items = await searchBuyMe(dest === ANY_CITY ? undefined : dest).unwrap();
      setResults(items);
    } catch {
      setResults([]);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    doSearch(destination);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black flex-1">Find Shopping Requests</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
        {/* Search form */}
        <form onSubmit={handleSearch} className="space-y-3 bg-white border border-black/5 p-4 rounded-2xl shadow-sm">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Destination City</label>
            <Select value={destination} onValueChange={setDestination}>
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

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-brand-green text-white shadow-sm ring-1 ring-black/5 hover:bg-brand-greenLight transition-colors mt-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Search size={16} className="mr-2" />}
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>

        {/* Results */}
        {searched && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              {results.length} Request{results.length !== 1 ? "s" : ""} Found
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 size={24} className="animate-spin text-brand-green" />
                <p className="text-sm font-medium text-slate-500">Finding requests...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <ShoppingBag size={24} className="text-slate-400" />
                </div>
                <h3 className="text-base font-bold text-black mb-1">No requests found</h3>
                <p className="text-sm text-slate-500 max-w-[250px]">
                  There are no open Buy-Me requests for this destination right now. Try searching another city.
                </p>
              </div>
            ) : (
              results.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col p-4 rounded-2xl border border-black/5 bg-white shadow-sm hover:shadow-md hover:border-brand-green/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-black truncate">{r.product_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        for <span className="font-medium text-slate-700">{r.receiver?.full_name}</span> · {r.destination}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                    {r.estimated_price ? (
                      <span className="font-semibold text-brand-green">${Number(r.estimated_price).toFixed(2)}</span>
                    ) : (
                      <span>Price TBD</span>
                    )}
                    <span>·</span>
                    <a
                      className="inline-flex items-center gap-1 underline hover:text-brand-green transition-colors"
                      href={r.product_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Product <ExternalLink size={12} />
                    </a>
                  </div>

                  {r.notes && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg mb-4">
                      "{r.notes}"
                    </div>
                  )}

                  <div className="mt-auto pt-2 border-t border-black/5 flex justify-end">
                    <Button
                      onClick={() => router.push(`/buy-me`)}
                      variant="outline"
                      className="h-9 rounded-lg border-brand-green/20 text-brand-green hover:bg-brand-green/5 text-xs"
                    >
                      <ShoppingBag size={14} className="mr-1.5" />
                      Accept via Hub
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
