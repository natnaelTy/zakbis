"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, Lock, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { etb, normalizeUrl, parseAmount, parseEtb, quote, type Currency } from "@/lib/money";
import { originCurrency, rates, type Trip } from "@/lib/sample-data";

const currencies = Object.keys(rates) as Currency[];
type FieldId = "link" | "screenshot" | "name" | "price" | "reward";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div id={`${id}-field`} className="space-y-1.5">
      <label htmlFor={id} className="block text-base font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-base text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export function RequestForm({ trip }: { trip: Trip }) {
  const name = trip.travelerName;
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileReject, setFileReject] = useState<string>();
  const [item, setItem] = useState("");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>(originCurrency[trip.originCountry]);
  const [reward, setReward] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);

  const unitPrice = parseAmount(price);
  const rewardEtb = parseEtb(reward);
  const rate = rates[currency];
  const itemEtb = unitPrice && Math.round(unitPrice * qty * rate) >= 1 ? Math.round(unitPrice * qty * rate) : null;
  const q = itemEtb && unitPrice && rewardEtb ? quote({ unitPrice, quantity: qty, rate, reward: rewardEtb }) : null;

  const errors: Partial<Record<FieldId, string>> = {};
  if (!normalizeUrl(link)) errors.link = "Paste the product link";
  if (!file) errors.screenshot = fileReject ?? "Add a screenshot of the product";
  if (!item.trim()) errors.name = "What's the item called?";
  if (!itemEtb) errors.price = "Enter the price shown online";
  if (!rewardEtb) errors.reward = "Offer a reward in ETB";
  const show = (id: FieldId) => (submitted ? errors[id] : id === "screenshot" ? fileReject : undefined);
  const invalid = (id: FieldId) => (show(id) ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = (["link", "screenshot", "name", "price", "reward"] as const).find((id) => errors[id]);
    if (!first) return setSent(true);
    const target = first === "screenshot" ? document.querySelector<HTMLElement>("#screenshot-field [role=button]") : document.getElementById(first);
    target?.focus();
  }

  if (sent && q && file) return <Sent name={name} item={item} qty={qty} total={q.total} file={file} />;

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6 pb-40 md:pb-0">
      <section className="space-y-4">
        <h2 className="text-lg font-bold">The product</h2>
        <Field id="link" label="Product link" error={show("link")}>
          <Input id="link" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} {...invalid("link")} />
        </Field>
        <Field id="screenshot" label="Screenshot" hint={`So ${name} buys exactly the right one.`} error={show("screenshot")}>
          <ImageUploadField
            id="screenshot"
            aria-describedby={show("screenshot") ? "screenshot-error" : undefined}
            aspectRatio={2}
            value={file}
            error={!!show("screenshot")}
            onChange={(f) => {
              setFile(f instanceof File ? f : null);
              setFileReject(undefined);
            }}
            onReject={setFileReject}
          />
        </Field>
        <Field id="name" label="Item name" error={show("name")}>
          <Input id="name" placeholder="Zara Golden Decade, 80 ml" value={item} onChange={(e) => setItem(e.target.value)} {...invalid("name")} />
        </Field>
        <div className="space-y-1.5">
          <span id="qty-label" className="block text-base font-semibold">
            Quantity
          </span>
          <div role="group" aria-labelledby="qty-label" className="inline-flex items-center rounded-lg border bg-card">
            <Button type="button" variant="ghost" size="icon" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
              <Minus aria-hidden className="size-4" />
            </Button>
            <output aria-live="polite" className="w-10 text-center text-base font-semibold tabular-nums">
              {qty}
            </output>
            <Button type="button" variant="ghost" size="icon" aria-label="Increase quantity" disabled={qty >= 10} onClick={() => setQty(qty + 1)}>
              <Plus aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
        <Field id="notes" label="Notes (optional)">
          <Textarea id="notes" className="md:text-base" placeholder="Size, color, model…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Price and reward</h2>
        <Field id="price" label="Price shown online (each)" error={show("price")}>
          <div className="flex gap-2">
            <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} {...invalid("price")} />
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-base font-semibold focus-visible:border-ring"
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <p className="text-base">
            <span className="font-semibold">≈ {itemEtb ? etb(itemEtb) : "— ETB"}</span>
            {qty > 1 && <span className="text-muted-foreground"> for {qty}</span>}
          </p>
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock aria-hidden className="size-3.5" /> 1 {currency} = {rate.toFixed(2)} ETB · locked when you send
          </p>
        </Field>
        <Field id="reward" label="Reward (ETB)" hint={`A thank-you to ${name} for shopping and carrying it.`} error={show("reward")}>
          <Input id="reward" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} {...invalid("reward")} />
        </Field>
      </section>

      <section aria-label="Summary" className="rounded-xl border bg-card p-4">
        <dl className="space-y-2 text-base">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              Item ({qty} × {unitPrice ? unitPrice.toLocaleString("en-US") : "—"} {currency})
            </dt>
            <dd className="font-semibold tabular-nums">{itemEtb ? etb(itemEtb) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reward</dt>
            <dd className="font-semibold tabular-nums">{rewardEtb ? etb(rewardEtb) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-dashed pt-2 text-lg">
            <dt className="font-bold">You pay</dt>
            <dd className="font-black tabular-nums">{q ? etb(q.total) : "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-md border-t bg-background/95 px-4 pt-2 pb-3 backdrop-blur md:static md:max-w-none md:border-0 md:bg-transparent md:p-0">
        <p className="mb-2 text-center text-[13px] text-muted-foreground md:text-base">You won&apos;t pay anything until {name} accepts</p>
        <Button type="submit" className="h-12 w-full rounded-lg text-base font-bold">
          Send request
        </Button>
      </div>
    </form>
  );
}

function Sent({ name, item, qty, total, file }: { name: string; item: string; qty: number; total: number; file: File }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [thumb, setThumb] = useState<string>();
  useEffect(() => {
    heading.current?.focus();
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <section className="mt-8 text-center">
      <CircleCheck aria-hidden className="mx-auto size-12 text-brand-text" strokeWidth={1.75} />
      <h2 ref={heading} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none">
        Request sent to {name}
      </h2>
      <div className="mx-auto mt-5 flex max-w-sm items-center gap-3 rounded-xl border bg-card p-3 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        {thumb && <img src={thumb} alt="" className="size-14 rounded-md object-cover" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {item} × {qty}
          </p>
          <p className="text-muted-foreground">You pay {etb(total)}</p>
        </div>
      </div>
      <p className="mt-5 text-base text-muted-foreground">
        {name} will accept or decline. You&apos;ll pay once {name} accepts.
      </p>
      <Link href="/" className="mt-6 inline-block font-semibold text-brand-text underline-offset-4 hover:underline">
        Back to trips
      </Link>
    </section>
  );
}
