"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { switchSide, useSide } from "@/components/auth/use-side";
import { createClient } from "@/lib/supabase/client";
import type { Side } from "@/lib/sides";
import { cn } from "@/lib/utils";

type Note = { id: string; request_id: string | null; body: string; read_at: string | null; created_at: string };

/** The active side's notes, newest first; opening the Inbox marks them read. */
export function InboxList() {
  const { side } = useSide();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");
  const [notes, setNotes] = useState<Note[]>();
  const [otherUnread, setOtherUnread] = useState(0);
  const [telegram, setTelegram] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!side) return;
    const supabase = createClient();
    void (async () => {
      const [{ data: auth }, list, unread] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("notes").select("id, request_id, body, read_at, created_at").eq("side", side).order("created_at", { ascending: false }).limit(100),
        supabase.rpc("unread_notes"),
      ]);
      if (list.error) return setFailed(true);
      setTelegram(typeof auth.user?.app_metadata?.telegram_id === "number");
      setNotes((list.data as Note[] | null) ?? []);
      setOtherUnread(((unread.data as { side: Side; n: number }[] | null) ?? []).find((u) => u.side !== side)?.n ?? 0);
      // Shown bold this once, then read.
      if ((list.data ?? []).some((n) => !n.read_at)) await supabase.rpc("mark_notes_read", { p_side: side });
    })();
  }, [side]);

  if (side === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (side === null)
    return (
      <div className="mt-6 space-y-4">
        <p className="text-base text-muted-foreground">Sign in to see your updates.</p>
        <Button className="h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(() => {})}>
          Sign in
        </Button>
        {sheet}
      </div>
    );
  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load your updates. Please reload.
      </p>
    );
  if (!notes) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;

  const other: Side = side === "receiver" ? "traveler" : "receiver";
  return (
    <>
      {otherUnread > 0 && (
        <button type="button" onClick={() => void switchSide(other)} className="mt-4 w-full rounded-xl border bg-card p-3 text-left text-base font-semibold text-brand-text">
          {otherUnread} new on your {other === "traveler" ? "traveling" : "receiving"} side
        </button>
      )}
      {notes.length === 0 ? (
        <p className="mt-6 text-base text-muted-foreground">No updates yet</p>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {notes.map((n) => {
            const body = (
              <>
                <span className={cn("block text-base", !n.read_at && "font-semibold")}>
                  {!n.read_at && <span aria-label="New" className="mr-2 inline-block size-2 rounded-full bg-primary align-middle" />}
                  {n.body}
                </span>
                <span className="text-[13px] text-muted-foreground">{formatDistanceToNowStrict(parseISO(n.created_at), { addSuffix: true })}</span>
              </>
            );
            return (
              <li key={n.id}>
                {n.request_id ? (
                  <Link href={`/orders/requests/${n.request_id}`} className="block py-3">
                    {body}
                  </Link>
                ) : (
                  <div className="py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-base">
        {telegram ? (
          <a href="https://t.me/ZakbisBot?start=updates" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-text underline-offset-4 hover:underline">
            Get updates on Telegram
          </a>
        ) : (
          <Link href="/profile/sign-in" className="font-semibold text-brand-text underline-offset-4 hover:underline">
            Connect Telegram for updates
          </Link>
        )}
      </p>
    </>
  );
}
