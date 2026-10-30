"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { REPORT_REASONS, tagLabel } from "@/lib/reviews";

type Row = {
  kind: "flag" | "report" | "blocked"; flag_id: string | null; review_id: string | null; user_id: string; side: "traveler" | "receiver"; name: string;
  created_at: string; rating: number | null; report_reason: string | null; review_text: string | null; blocked: boolean;
};
type About = { review_id: string; rating: number; tags: string[]; text: string | null; note: string | null; author_name: string; created_at: string; hidden_at: string | null };

const btn = "h-11 rounded-lg px-5 text-base font-semibold";

/** Low-rating flags (dismiss, revoke a traveler, block a receiver) and reported reviews (hide or keep). */
export function ReviewQueue() {
  const [rows, setRows] = useState<Row[]>();
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("reviews_to_check");
    if (error) return setFailed(true);
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) return <p className="mt-4 text-base text-destructive">Couldn&apos;t load reviews. Please reload.</p>;
  if (!rows) return <p className="mt-4 text-base text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="mt-4 text-base text-muted-foreground">Nothing to check</p>;
  return (
    <div className="space-y-6 pb-8">
      {(["flag", "report", "blocked"] as const).map((kind) => {
        const list = rows.filter((r) => r.kind === kind);
        return list.length ? (
          <section key={kind} className="mt-4">
            <h2 className="text-lg font-bold">{{ flag: "Low ratings", report: "Reported reviews", blocked: "Blocked receivers" }[kind]}</h2>
            <ul className="mt-2 space-y-3">
              {list.map((r) => (
                <li key={r.flag_id ?? r.review_id ?? r.user_id}>
                  <Card row={r} onDone={load} />
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}

function Card({ row: r, onDone }: { row: Row; onDone: () => Promise<void> }) {
  const [about, setAbout] = useState<About[]>();
  const [confirm, setConfirm] = useState<[string, string, Record<string, unknown>]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    const { error: err } = await createClient().rpc(confirm[1], confirm[2]);
    setBusy(false);
    setConfirm(undefined);
    if (err) setError("This changed in the meantime. Here's the latest.");
    await onDone();
  }
  async function show() {
    const { data } = await createClient().rpc("reviews_about", { p_user: r.user_id, p_side: r.side });
    setAbout((data as About[] | null) ?? []);
  }

  const actions: [string, string, Record<string, unknown>][] =
    r.kind === "flag"
      ? [
          ["Dismiss", "resolve_flag", { p_flag: r.flag_id, p_action: "dismiss" }],
          r.side === "traveler"
            ? ["Revoke verification", "resolve_flag", { p_flag: r.flag_id, p_action: "revoke" }]
            : ["Block from new requests", "resolve_flag", { p_flag: r.flag_id, p_action: "block" }],
        ]
      : r.kind === "blocked"
        ? [["Unblock", "unblock_receiver", { p_user: r.user_id }]]
        : [
          ["Hide review", "decide_report", { p_review: r.review_id, p_hide: true }],
          ["Keep", "decide_report", { p_review: r.review_id, p_hide: false }],
        ];

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-base font-bold">
        {r.name} <span className="font-normal text-muted-foreground">({r.side}) · {formatDistanceToNowStrict(parseISO(r.created_at))}</span>
      </p>
      {r.kind === "report" && (
        <div className="space-y-1">
          <p className="text-base font-semibold">Reported: {REPORT_REASONS.find((x) => x.key === r.report_reason)?.label}</p>
          <p className="text-base">
            {r.rating} ★{r.review_text && ` · ${r.review_text}`}
          </p>
        </div>
      )}
      {r.kind !== "report" &&
        (about ? (
          <ul className="divide-y border-y text-base">
            {about.map((a) => (
              <li key={a.review_id} className="py-2">
                <p>
                  <span className="font-semibold">{a.rating} ★</span> from {a.author_name}
                  {a.hidden_at && <span className="text-muted-foreground"> (hidden)</span>}
                  {a.tags.length > 0 && <span className="text-muted-foreground"> · {a.tags.map(tagLabel).join(", ")}</span>}
                </p>
                {a.text && <p className="break-words">{a.text}</p>}
                {a.note && <p className="break-words text-muted-foreground">Private: {a.note}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className="text-base font-medium text-brand-text underline-offset-4 hover:underline" onClick={() => void show()}>
            Show reviews
          </button>
        ))}
      {confirm ? (
        <div role="alertdialog" aria-label={`${confirm[0]}?`} className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{confirm[0]}?</span>
          <Button className={btn} disabled={busy} onClick={() => void run()}>
            Yes
          </Button>
          <Button variant="outline" className={btn} onClick={() => setConfirm(undefined)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a[0]} variant="outline" className={btn} onClick={() => (setError(undefined), setConfirm(a))}>
              {a[0]}
            </Button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    </article>
  );
}
