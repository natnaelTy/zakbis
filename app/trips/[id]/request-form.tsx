"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, focusField, invalidProps, ItemRow, PriceField, ProductFields, SendBar, SuccessView, useItemFields, type ItemFieldId } from "@/components/request/item-fields";
import { Input } from "@/components/ui/input";
import { etb, parseEtb, quote } from "@/lib/money";
import { originCurrency, type Trip } from "@/lib/sample-data";

type FieldId = ItemFieldId | "reward";

export function RequestForm({ trip }: { trip: Trip }) {
  const name = trip.travelerName;
  const f = useItemFields(originCurrency[trip.originCountry]);
  const [reward, setReward] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);

  const rewardEtb = parseEtb(reward);
  const q = f.itemEtb && f.unitPrice && rewardEtb ? quote({ unitPrice: f.unitPrice, quantity: f.qty, rate: f.rate, reward: rewardEtb }) : null;

  const errors: Partial<Record<FieldId, string>> = { ...f.errors };
  if (!rewardEtb) errors.reward = "Offer a reward in ETB";
  // The screenshot is optional when a link is given, so its only error is a rejected file, shown as soon as it happens.
  const show = (id: FieldId) => (id === "screenshot" ? f.fileReject : submitted ? errors[id] : undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = (["link", "screenshot", "name", "price", "reward"] as const).find((id) => errors[id]);
    if (!first) return setSent(true);
    focusField(first);
  }

  if (sent && q)
    return (
      <SuccessView heading={`Request sent to ${name}`} file={f.file} item={f.item} qty={f.qty} amountLine={`You pay ${etb(q.total)}`}>
        <p className="mt-5 text-base text-muted-foreground">
          {name} will accept or decline. You&apos;ll pay once {name} accepts.
        </p>
        <Link href="/" className="mt-6 inline-block font-semibold text-brand-text underline-offset-4 hover:underline">
          Back to trips
        </Link>
      </SuccessView>
    );

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6 pb-40 md:pb-0">
      <ProductFields f={f} show={show} travelerName={name} />

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Price and reward</h2>
        <PriceField f={f} show={show} rateNote="send" />
        <Field id="reward" label="Reward (ETB)" hint={`A thank-you to ${name} for shopping and carrying it.`} error={show("reward")}>
          <Input id="reward" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} {...invalidProps(show("reward"), "reward")} />
        </Field>
      </section>

      <section aria-label="Summary" className="rounded-xl border bg-card p-4">
        <dl className="space-y-2 text-base">
          <ItemRow f={f} />
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

      <SendBar note={`You won't pay anything until ${name} accepts`} label="Send request" />
    </form>
  );
}
