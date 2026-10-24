"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Field, focusField, invalidProps, ItemRow, PriceField, ProductFields, SendBar, SuccessView, useItemFields, type ItemFieldId } from "@/components/request/item-fields";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { etb, type Currency } from "@/lib/money";
import { addisToday, countryLabel, countryList, defaultCurrency, inNeededByRange, neededByRange, type Country } from "@/lib/open-requests";

const allCountries = Object.keys(countryLabel) as Country[];
type FieldId = ItemFieldId | "countries" | "neededBy";

/** Remounting on "Post another" resets every field without per-field reset code. */
export function PostRequestForm() {
  const [round, setRound] = useState(0);
  return <PostForm key={round} refocus={round > 0} onPostAnother={() => setRound(round + 1)} />;
}

function PostForm({ refocus, onPostAnother }: { refocus: boolean; onPostAnother: () => void }) {
  const f = useItemFields(defaultCurrency([]));
  const [picked, setPicked] = useState<Country[]>([]);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [neededBy, setNeededBy] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [posted, setPosted] = useState(false);
  const { requireAuth, sheet } = useRequireAuth("Sign in to post your request");
  // The remount removes the focused "Post another" button; put keyboard users back at the start of the form.
  useEffect(() => {
    if (refocus) focusField("countries");
  }, [refocus]);
  const today = addisToday(new Date());
  const range = neededByRange(today);

  function pick(values: string[]) {
    // Keep tap order (the currency follows the first country tapped), whatever order the group reports.
    const next = [...picked.filter((p) => values.includes(p)), ...(values as Country[]).filter((c) => !picked.includes(c))];
    setPicked(next);
    if (!currencyTouched) f.setCurrency(defaultCurrency(next));
  }

  const errors: Partial<Record<FieldId, string>> = { ...f.errors };
  if (!picked.length) errors.countries = "Pick at least one country";
  if (!inNeededByRange(neededBy, today)) errors.neededBy = "Pick the date you need it by";
  // The screenshot is optional when a link is given, so its only error is a rejected file, shown as soon as it happens.
  const show = (id: FieldId) => (id === "screenshot" ? f.fileReject : submitted ? errors[id] : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = (["countries", "link", "screenshot", "name", "price", "neededBy"] as const).find((id) => errors[id]);
    if (!first) return void requireAuth(() => setPosted(true));
    focusField(first);
  }

  if (posted && f.itemEtb)
    return (
      <SuccessView heading="Your request is live" file={f.file} item={f.item} qty={f.qty} amountLine={`Item cost ≈ ${etb(f.itemEtb)}`}>
        <p className="mt-5 text-base text-muted-foreground">
          Travelers flying from {countryList(picked)} who land by {format(parseISO(neededBy), "d MMM")} can offer to bring it. You choose who.
        </p>
        <div className="mt-6 flex justify-center gap-6">
          <Link href="/" className="font-semibold text-brand-text underline-offset-4 hover:underline">
            Back to trips
          </Link>
          <button type="button" onClick={onPostAnother} className="font-semibold text-brand-text underline-offset-4 hover:underline">
            Post another
          </button>
        </div>
      </SuccessView>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6 pb-40 md:pb-0">
      <section id="countries-field" className="space-y-2">
        <h2 id="countries-label" className="text-lg font-bold">
          Bring it from
        </h2>
        <ToggleGroup
          multiple
          value={picked}
          onValueChange={pick}
          aria-labelledby="countries-label"
          aria-describedby={show("countries") ? "countries-error" : undefined}
          className="flex-wrap"
        >
          {allCountries.map((c, i) => (
            <ToggleGroupItem
              key={c}
              value={c}
              id={i === 0 ? "countries" : undefined}
              variant="outline"
              className={cn(
                "h-auto rounded-full bg-card px-4 py-2 text-base font-medium hover:border-foreground/30 hover:bg-card",
                "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground",
                show("countries") && "border-destructive",
              )}
            >
              {countryLabel[c]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {show("countries") ? (
          <p id="countries-error" role="alert" className="text-base text-destructive">
            {show("countries")}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">Pick every country it could come from.</p>
        )}
      </section>

      <ProductFields f={f} show={show} />

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Price and timing</h2>
        <PriceField
          f={f}
          show={show}
          rateNote="post"
          hint="Travelers name their reward when they offer. You only pay once you accept an offer."
          onCurrencyChange={(c: Currency) => {
            setCurrencyTouched(true);
            f.setCurrency(c);
          }}
        />
        <Field id="neededBy" label="Needed by" hint="Only travelers landing in Addis by this date will see it." error={show("neededBy")}>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger
              id="neededBy"
              {...invalidProps(show("neededBy"), "neededBy")}
              className="flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 aria-invalid:border-destructive"
            >
              <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
              {neededBy ? format(parseISO(neededBy), "EEE d MMM yyyy") : <span className="text-muted-foreground">Pick a date</span>}
            </PopoverTrigger>
            {/* Only rendered when open, in the browser, so "today" is always the visitor's current Addis date. */}
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                className="[--cell-size:--spacing(10)]" // 40px days: finger-sized on phones
                selected={neededBy ? parseISO(neededBy) : undefined}
                defaultMonth={parseISO(neededBy || range.min)}
                startMonth={parseISO(range.min)}
                endMonth={parseISO(range.max)}
                disabled={[{ before: parseISO(range.min) }, { after: parseISO(range.max) }]}
                onSelect={(d) => {
                  if (!d) return;
                  setNeededBy(format(d, "yyyy-MM-dd"));
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>
      </section>

      <section aria-label="Summary" className="rounded-xl border bg-card p-4">
        <dl className="space-y-2 text-base">
          <ItemRow f={f} />
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reward</dt>
            <dd className="text-right text-muted-foreground">Set by the traveler&apos;s offer</dd>
          </div>
        </dl>
      </section>

      <SendBar note="You won't pay anything until you accept a traveler's offer" label="Post request" />
      {sheet}
    </form>
  );
}
