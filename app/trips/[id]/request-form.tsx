"use client";

import Link from "next/link";
import { useState } from "react";
import { focusField, ItemRow, PriceField, ProductFields, SendBar, SuccessView, useItemFields, type ItemFieldId } from "@/components/request/item-fields";
import { saveRequest } from "@/components/request/save-request";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { etb, originCurrency, type Currency } from "@/lib/money";
import { CONTACT_ERROR, hasContactDetails } from "@/lib/negotiation";
import type { TripCard } from "@/lib/trips";

export function RequestForm({ trip, rates }: { trip: TripCard; rates: Partial<Record<Currency, number>> }) {
  const name = trip.travelerName;
  const f = useItemFields(originCurrency[trip.originCountry], rates);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [sentId, setSentId] = useState<string>();
  const { requireAuth, sheet } = useRequireAuth("Sign in to send your request", "receiver");

  const errors = f.errors;
  // The screenshot is optional when a link is given, so its only error is a rejected file, shown as soon as it happens.
  const show = (id: ItemFieldId) => (id === "screenshot" ? f.fileReject : submitted ? errors[id] : undefined);

  async function send() {
    setBusy(true);
    const res = await saveRequest(f, { kind: "trip", trip_id: trip.id });
    setBusy(false);
    if ("error" in res) setSendError(res.error);
    else setSentId(res.id);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setSendError(undefined);
    const first = (["link", "screenshot", "name", "price"] as const).find((id) => errors[id]);
    if (first) return focusField(first);
    if (hasContactDetails(f.item) || hasContactDetails(f.notes)) return setSendError(CONTACT_ERROR);
    requireAuth(() => void send());
  }

  if (sentId && f.itemEtb)
    return (
      <SuccessView heading={`Request sent to ${name}`} file={f.file} item={f.item} qty={f.qty} amountLine={`Item cost ≈ ${etb(f.itemEtb)}`}>
        <p className="mt-5 text-base text-muted-foreground">{name} has 48 hours to answer.</p>
        <Link href={`/orders/requests/${sentId}`} className="mt-6 inline-block font-semibold text-brand-text underline-offset-4 hover:underline">
          See your request
        </Link>
      </SuccessView>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6 pb-40 md:pb-0">
      <ProductFields f={f} show={show} travelerName={name} />

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Price</h2>
        <PriceField f={f} show={show} rateNote="send" />
      </section>

      <section aria-label="Summary" className="rounded-xl border bg-card p-4">
        <dl className="space-y-2 text-base">
          <ItemRow f={f} />
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reward</dt>
            <dd className="text-right text-muted-foreground">{name} names it</dd>
          </div>
        </dl>
      </section>

      {sendError && (
        <p role="alert" className="text-base text-destructive">
          {sendError}
        </p>
      )}
      <SendBar note="You won't pay anything until you accept a price" label="Send request" busy={busy} />
      {sheet}
    </form>
  );
}
