"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Lock, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field as UIField, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { etb, parseAmount, productError, type Currency } from "@/lib/money";
import { rates } from "@/lib/sample-data";

const currencies = Object.keys(rates) as Currency[];
export type ItemFieldId = "link" | "screenshot" | "name" | "price";
export type Show = (id: ItemFieldId) => string | undefined;

/** shadcn Field with the app's 16px label/error sizes; ids stay `${id}-field` / `${id}-error` for focus and aria wiring. */
export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <UIField id={`${id}-field`} className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-base font-semibold">
        {label}
      </FieldLabel>
      {children}
      {error ? (
        <FieldError id={`${id}-error`} className="text-base">
          {error}
        </FieldError>
      ) : (
        hint && <FieldDescription className="text-[13px]">{hint}</FieldDescription>
      )}
    </UIField>
  );
}

export const invalidProps = (error: string | undefined, id: string) => (error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {});

/** Focus a field by id; the screenshot's focusable element is the uploader's button. */
export function focusField(id: string) {
  const target = id === "screenshot" ? document.querySelector<HTMLElement>("#screenshot-field [role=button]") : document.getElementById(id);
  target?.focus();
}

export function useItemFields(defaultCurrency: Currency) {
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileReject, setFileReject] = useState<string>();
  const [item, setItem] = useState("");
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  const unitPrice = parseAmount(price);
  const rate = rates[currency];
  const itemEtb = unitPrice && Math.round(unitPrice * qty * rate) >= 1 ? Math.round(unitPrice * qty * rate) : null;

  const errors: Partial<Record<ItemFieldId, string>> = {};
  const linkError = productError(link, !!file);
  if (linkError) errors.link = linkError;
  if (!item.trim()) errors.name = "What's the item called?";
  if (!itemEtb) errors.price = "Enter the price shown online";

  return { link, setLink, file, setFile, fileReject, setFileReject, item, setItem, qty, setQty, notes, setNotes, price, setPrice, currency, setCurrency, unitPrice, rate, itemEtb, errors };
}
export type ItemFieldsState = ReturnType<typeof useItemFields>;

export function ProductFields({ f, show, travelerName }: { f: ItemFieldsState; show: Show; travelerName?: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">The product</h2>
      <Field id="link" label="Product link" hint="A link, a screenshot, or both." error={show("link")}>
        <Input id="link" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={f.link} onChange={(e) => f.setLink(e.target.value)} {...invalidProps(show("link"), "link")} />
      </Field>
      <Field id="screenshot" label="Screenshot" hint={`So ${travelerName ?? "the traveler"} buys exactly the right one.`} error={show("screenshot")}>
        <ImageUploadField
          id="screenshot"
          aria-describedby={show("screenshot") ? "screenshot-error" : undefined}
          aspectRatio={2}
          value={f.file}
          error={!!show("screenshot")}
          onChange={(file) => {
            f.setFile(file instanceof File ? file : null);
            f.setFileReject(undefined);
          }}
          onReject={f.setFileReject}
        />
      </Field>
      <Field id="name" label="Item name" error={show("name")}>
        <Input id="name" placeholder="Zara Golden Decade, 80 ml" value={f.item} onChange={(e) => f.setItem(e.target.value)} {...invalidProps(show("name"), "name")} />
      </Field>
      <div className="space-y-1.5">
        <span id="qty-label" className="block text-base font-semibold">
          Quantity
        </span>
        <div role="group" aria-labelledby="qty-label" className="inline-flex items-center rounded-lg border bg-card">
          <Button type="button" variant="ghost" size="icon" aria-label="Decrease quantity" disabled={f.qty <= 1} onClick={() => f.setQty(f.qty - 1)}>
            <Minus aria-hidden className="size-4" />
          </Button>
          <output aria-live="polite" className="w-10 text-center text-base font-semibold tabular-nums">
            {f.qty}
          </output>
          <Button type="button" variant="ghost" size="icon" aria-label="Increase quantity" disabled={f.qty >= 10} onClick={() => f.setQty(f.qty + 1)}>
            <Plus aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <Field id="notes" label="Notes (optional)">
        <Textarea id="notes" className="md:text-base" placeholder="Size, color, model…" value={f.notes} onChange={(e) => f.setNotes(e.target.value)} />
      </Field>
    </section>
  );
}

export function PriceField({
  f,
  show,
  rateNote,
  hint,
  onCurrencyChange,
}: {
  f: ItemFieldsState;
  show: Show;
  rateNote: "send" | "post";
  hint?: React.ReactNode;
  onCurrencyChange?: (c: Currency) => void;
}) {
  return (
    <Field id="price" label="Price shown online (each)" error={show("price")}>
      <div className="flex gap-2">
        <Input id="price" inputMode="decimal" value={f.price} onChange={(e) => f.setPrice(e.target.value)} {...invalidProps(show("price"), "price")} />
        <Select value={f.currency} onValueChange={(c) => (onCurrencyChange ?? f.setCurrency)(c as Currency)}>
          <SelectTrigger aria-label="Currency" className="w-28 shrink-0 font-semibold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-base">
        <span className="font-semibold">≈ {f.itemEtb ? etb(f.itemEtb) : "— ETB"}</span>
        {f.qty > 1 && <span className="text-muted-foreground"> for {f.qty}</span>}
      </p>
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Lock aria-hidden className="size-3.5" /> 1 {f.currency} = {f.rate.toFixed(2)} ETB · locked when you {rateNote}
      </p>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
    </Field>
  );
}

export function ItemRow({ f }: { f: ItemFieldsState }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">
        Item ({f.qty} × {f.unitPrice ? f.unitPrice.toLocaleString("en-US") : "—"} {f.currency})
      </dt>
      <dd className="font-semibold tabular-nums">{f.itemEtb ? etb(f.itemEtb) : "—"}</dd>
    </div>
  );
}

// Sits exactly on the 64px tab bar (+1px border); pb-4 leaves room for the raised Post button.
export function SendBar({ note, label }: { note: string; label: string }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(65px+env(safe-area-inset-bottom))] z-10 mx-auto max-w-md border-t bg-background/95 px-4 pt-2 pb-4 backdrop-blur md:static md:max-w-none md:border-0 md:bg-transparent md:p-0">
      <p className="mb-2 text-center text-[13px] text-muted-foreground md:text-base">{note}</p>
      <Button type="submit" className="h-12 w-full rounded-lg text-base font-bold">
        {label}
      </Button>
    </div>
  );
}

/** Success screen shell: focused heading, item recap with the screenshot thumbnail, then form-specific content. */
export function SuccessView({ heading, file, item, qty, amountLine, children }: { heading: string; file: File | null; item: string; qty: number; amountLine: string; children: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [thumb, setThumb] = useState<string>();
  useEffect(() => {
    ref.current?.focus();
    if (!file) return;
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <section className="mt-8 text-center">
      <CircleCheck aria-hidden className="mx-auto size-12 text-brand-text" strokeWidth={1.75} />
      <h2 ref={ref} tabIndex={-1} className="mt-3 text-2xl font-bold outline-none">
        {heading}
      </h2>
      <div className="mx-auto mt-5 flex max-w-sm items-center gap-3 rounded-xl border bg-card p-3 text-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        {thumb && <img src={thumb} alt="" className="size-14 rounded-md object-cover" />}
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {item} × {qty}
          </p>
          <p className="text-muted-foreground">{amountLine}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
