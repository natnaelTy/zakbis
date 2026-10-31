# Flight Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveler whose flight moved or was cancelled after orders were paid asks Zakbis, an admin approves or rejects, and receivers either keep the order (new dates) or cancel for a full refund. A cancelled flight refunds every paid order. Flight-change refunds never open reviews.

**Architecture:** One migration, `0013_flight_changes.sql`, adds:
- a `flight_changes` table;
- request, decide, keep and cancel functions;
- a no-review flag that the 0012 review-window trigger honours;
- a `run_deadlines()` copy whose steps 9–11 skip trips with a pending change.

On screen, the traveler gets a "My flight changed" form on their trip page, receivers get a banner on the order page, and admins get a Flight changes section on the Trip checks page.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind/shadcn, Supabase (Postgres 16, RLS, Storage).

**Spec:** `docs/superpowers/specs/2026-10-31-flight-changes-design.md`

## Global Constraints
- **Paid orders** means status `paid` or `purchased`. A traveler can ask only when the trip is `live`, has at least one paid order, has no order at `landed`, and has no pending change.
- **A move needs:** the new `shop_by` and `arrival_date`, with `arrival_date >= shop_by >= addis_today()`; the passport valid through the new arrival date; and a new ticket that's the caller's own file in the private `tickets` bucket. **A cancellation** takes an optional proof file, under the same ownership rule if given.
- **Approving a move:**
  - the trip's `shop_by`, `arrival_date` and `proof_path` are updated under `zakbis.deciding` (the admin bypass);
  - affected orders get `buy_due_at = null`, `flight_moved_at = now()` and `flight_kept_at = null`; affected means `paid`, `purchased`, or `awaiting_payment` with a pending screenshot;
  - each affected receiver is notified: `%s's flight moved. Your %s now arrives around %s. Keep the order or cancel for a full refund.` (date as `FMDD Mon`).
- **Approving a cancellation:**
  - each `paid` or `purchased` order goes through `flight_refund`, with the receiver note `%s's flight was cancelled. We'll refund you %s.` and the traveler note `The order for %s is cancelled. Return the item to the shop if you can.`;
  - each pending-screenshot order's receiver gets `%s's flight was cancelled. We'll refund you once we've checked your payment.`;
  - then the trip is set `cancelled`, and the existing `trips_after_change` closes unpaid requests and offers.
- **Rejecting** requires a reason. The traveler gets `Zakbis couldn't approve your flight change: %s`.
- **Approval notes to the traveler:** `Zakbis approved your new dates.` or `Zakbis cancelled your trip and is refunding your receivers.`
- **A new request** notifies admins: `Flight change to check: %s (%s).`
- **`flight_refund(r, rnote, tnote)`** is like `decide_refund` but also sets `no_review = true`. The 0012 trigger `requests_review_window` must not open the window when `new.no_review`.
- **While a change is pending,** `run_deadlines` steps 9 (not bought), 10 (missed swap) and 11 (traveler no-show) skip that trip's orders.
- **The receiver's choice:** `keep_after_move` sets `flight_kept_at`; `cancel_after_move` calls `flight_refund`. Both need the receiver, `flight_moved_at` set, and status `paid` or `purchased`.
- **Housekeeping:** the migration is applied by the user inside `begin;`/`commit;`. Never commit `.claude/`, `CLAUDE.md`, `skills-lock.json`, `graphify-out/`, `.env*` or `next-env.d.ts`. Run `graphify update .` after code changes.
- **Tests:** `sh supabase/tests/run.sh`, `node --test lib/*.test.ts`, `npm run lint`, `npm run build`.

## Review Focus
1. **A cancellation that leaves money unaccounted for:** each paid or bought order must end refund-decided, and each pending screenshot must still be listed on Payment checks as "trip changed". Tested in Task 2.
2. **Dates moving without an admin, or the traveler changing someone else's trip.** Tested in Task 1.
3. **Reviews or flags after a flight-change refund**, from either the receiver's cancel or the cancellation approval. Tested in Task 1 and Task 2.
4. **The every-minute job blaming the traveler while a change is pending**, and resuming once it's decided. Tested in Task 2.
5. **Old deadlines surviving a move:** a `buy_due_at` extension that isn't cleared, or a photo, In Addis or no-show check still reading the old dates. Tested in Task 1.

---

### Task 1: Requests, decisions on a move, the receiver's choice, no reviews

**Files:**
- Create: `supabase/migrations/0013_flight_changes.sql`, `supabase/tests/flight_changes_test.sql`

**Interfaces:**
- Produces:
  - **The `flight_changes` table:** `(id, trip_id references trips on delete cascade, kind text check in ('moved','cancelled'), new_shop_by date, new_arrival date, proof_path text, status text default 'pending' check in ('pending','approved','rejected'), reason text, created_at, decided_at, decided_by)`, plus a unique partial index on `trip_id` where `status = 'pending'`. RLS: the trip's traveler and admins can read; no write policies.
  - **On `requests`:** `flight_moved_at timestamptz`, `flight_kept_at timestamptz`, `no_review boolean not null default false`.
  - **Replaced:** `requests_review_window` (a copy of 0012's, with a `not new.no_review` guard) and `my_trips`, a copy of 0008's with two extra columns: `paid_orders int` and `pending_change text` (the kind, or null).
  - **New functions:**
    - `request_flight_change(p_trip uuid, p_kind text, p_shop_by date default null, p_arrival date default null, p_proof text default null) returns uuid`;
    - `decide_flight_change(p_change uuid, p_approve boolean, p_reason text default null)` (moves in this task, cancellations in Task 2);
    - `flight_refund(r requests, p_receiver_note text, p_traveler_note text)` (internal);
    - `keep_after_move(p_request uuid)` and `cancel_after_move(p_request uuid)`;
    - `flight_changes_to_check()`, admin only, returning `(id, trip_id, kind, traveler_name, origin_city, old_shop_by, old_arrival, new_shop_by, new_arrival, proof_path, paid_orders int, created_at)`.

- [ ] **Step 1: Write the failing tests** in `flight_changes_test.sql`, using the setup style of `reviews_test.sql`: a trip, one paid order and one purchased order with `buy_due_at` set, and a ticket file in `tickets/<traveler>/new.pdf`.
  - **Who can ask:**
    - the receiver or a stranger calling `request_flight_change` raises "only the traveler";
    - a trip with no paid orders raises "change the trip directly";
    - a move without a ticket, or with someone else's file, raises "upload your new ticket";
    - a date in the past raises "dates";
    - a valid move returns an id, writes an admin note `Flight change to check%`, and a second request raises "already".
  - **Admin only:** as a non-admin, `decide_flight_change` and `flight_changes_to_check` raise "admins only".
  - **Rejecting:** without a reason it raises "reason". With a reason, the change is `rejected`, the trip is unchanged and the traveler gets a note.
  - **Approving a move:**
    - the trip has the new dates and ticket and is still `live`;
    - both orders have `flight_moved_at` set and `buy_due_at` null;
    - both receivers get the note `%flight moved%`;
    - the traveler gets `Zakbis approved your new dates.`;
    - `buy_due(order)` equals the end of the new shop-by day.
  - **The receiver's choice:**
    - `keep_after_move` by the traveler raises "only the receiver"; by the receiver it sets `flight_kept_at`;
    - `cancel_after_move` on the other order → `cancelled`, `refund_decided_at` set, `no_review` true, `review_open_at` **null**, and no `How was` note;
    - `cancel_after_move` on an order that was never moved raises "no longer valid".
  - **Landed orders block requests:** with an order on the trip set to `landed` by superuser, `request_flight_change` raises "contact support".
- [ ] **Step 2: Run and watch them fail.** `sh supabase/tests/run.sh` shows FAIL `flight_changes_test.sql`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `sh supabase/tests/run.sh` passes all files.
- [ ] **Step 5: Commit.** `git commit -m "feat: flight change requests, admin approval of moves, keep or refund"`

### Task 2: Cancellations, and pausing the traveler-blaming deadlines

**Files:**
- Modify: `supabase/migrations/0013_flight_changes.sql` (the cancellation branch of `decide_flight_change`, plus `create or replace run_deadlines()` as a copy of 0012's with the pending-change skip added to steps 9, 10 and 11)
- Test: `supabase/tests/flight_changes_test.sql`

**Interfaces:**
- Consumes: `flight_refund`, `trips_after_change` (0009) and `payments_to_check` (0010, which already marks `trip_changed`).

- [ ] **Step 1: Write the failing tests:**
  - **Approving a cancellation** on a fresh trip with a paid order, a purchased order, a pending-screenshot order and an open request:
    - the paid and purchased orders are `cancelled` with `refund_decided_at` set, `no_review` true and no review window;
    - the pending-screenshot order is still `awaiting_payment`, its receiver got `%we've checked your payment%`, and `payments_to_check()` lists it with `trip_changed = true`;
    - the open request is `cancelled` through `trips_after_change`;
    - the trip is `cancelled`;
    - `orders_to_act()` lists the two refunds.
  - **Deadlines pause while pending:** with a pending change on a trip, a `paid` order past `buy_due`, a `purchased` and `rejected` order past `buy_due`, and a `purchased` order more than 7 days after arrival, `run_deadlines()` leaves all three unchanged: no hold, no refund. After the change is rejected, `run_deadlines()` acts on them as before.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `sh supabase/tests/run.sh` passes all files.
- [ ] **Step 5: Commit.** `git commit -m "feat: approving a cancelled flight refunds paid orders; deadlines wait for the decision"`

### Task 3: Traveler form and receiver banner

**Files:**
- Create: `components/trips/flight-change-form.tsx`, plus the ticket upload taken out of `components/trips/trip-form.tsx:81-87` into `components/trips/upload-ticket.ts` (`uploadTicket(file: File): Promise<{ path: string } | { error: string }>`), which `TripForm` then uses
- Modify:
  - `app/orders/trips/[id]/trip-detail.tsx`: when `t.status === "live"` and `t.paid_orders > 0`, show `FlightChangeForm` in place of "Change date" and "Cancel trip". When `t.pending_change` is set, show "Zakbis is checking your flight change". Extend the `MyTrip` type with `paid_orders` and `pending_change`.
  - `app/orders/requests/[id]/order-detail.tsx`: add `flight_moved_at` and `flight_kept_at` to `Request`. For a receiver viewing a `paid` or `purchased` order with `flight_moved_at` set and `flight_kept_at` null, show a banner ("{traveler}'s flight moved. Keep your order or cancel for a full refund.") with "Keep my order" (`keep_after_move`) and "Cancel and refund" (confirm inline, then `cancel_after_move`).

**Interfaces:**
- Produces: `FlightChangeForm({ trip, onDone })`, which has:
  - a radio group, "Moved to a new date" or "Cancelled";
  - for a move: date inputs "New shop-by date" and "New landing date", plus a required "New ticket" upload (PDF or image, the same accept list as `TripForm`);
  - for a cancellation: an optional "Airline notice (optional)" upload;
  - a "Send to Zakbis" button.
  
  Error mapping: "dates" → "Check the dates", "upload your new ticket" → "Upload your new ticket", "already" → "Zakbis is already checking a change", "contact support" → "Someone is already meeting you in Addis. Contact support."

- [ ] **Step 1: Check the change visually.** There's no UI test harness; this task is verified by `npm run lint`, `npm run build` and the browser walk-through. Ledger that as a ruling.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run.** `npm run lint` and `npm run build` pass, and `sh supabase/tests/run.sh` still passes.
- [ ] **Step 4: Commit.** `git commit -m "feat: my flight changed form and keep-or-refund banner"`

### Task 4: Admin Flight changes section

**Files:**
- Create: `app/admin/trips/flight-changes.tsx`
- Modify: `app/admin/trips/page.tsx`, to render `<FlightChanges />` above `TripQueue` under the heading "Flight changes"

**Interfaces:**
- Consumes: `flight_changes_to_check` and `decide_flight_change`.
- Produces: per row:
  - the traveler, "Moved" or "Cancelled", old → new dates, the paid orders affected, and "View ticket" (a signed URL from `tickets`, valid for 300 s, as `trip-detail.tsx` does);
  - "Approve" (confirm inline) and "Reject", which needs a reason in a `Textarea`, the same pattern as `payment-queue.tsx`.
  
  The section renders nothing when there are no rows.

- [ ] **Step 1: Ledger the verification:** the type check, the build and the walk-through.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run.** `npm run lint` and `npm run build` pass.
- [ ] **Step 4: Commit.** `git commit -m "feat: admin flight changes section"`

### Task 5: Final checks
- [ ] Run the full suite and `graphify update .`.
- [ ] Hand the user their step: apply `0013_flight_changes.sql` in `begin;`/`commit;`. The browser walk-through follows.
