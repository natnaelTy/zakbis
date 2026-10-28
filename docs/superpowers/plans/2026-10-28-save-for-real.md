# Save for real: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Requests and open requests save for real, with a price back-and-forth, manual payment checked by an admin, server-run deadlines, and an Inbox plus Telegram notes.

**Architecture:**
- **The database owns the rules.** Every state change goes through a security-definer function in two new migrations, and the browser never writes money or status.
- **Pages talk to Supabase directly,** as they do today: direct selects under row-level security, plus `rpc()` for changes.
- **Deadlines and Telegram run on a Supabase cron job.** It calls plain SQL functions the tests can call too. The cron and HTTP layer lives in a separate file the user runs once on the live database.

**Tech stack:** Next.js 16 App Router, React 19, Tailwind, shadcn, Supabase (`@supabase/ssr`), Postgres 16 tests, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-save-for-real-design.md`

## Global constraints
- **All status and money changes go through security-definer functions** with `set search_path = public`.
  - No new insert or update policies on `requests`, `offers`, `offer_events`, `payments` or `notes`.
  - Internal helpers (`notify`, `settle_offer`, `run_deadlines`, `telegram_outbox`, `mark_telegram_sent`) get `revoke execute ... from public, anon, authenticated`, because the default privileges grant execute to everyone.
- **New enum values** (`alter type ... add value`) may appear only inside plpgsql function bodies in the same migration. The user applies migrations inside `begin;`/`commit;`, and Postgres can't use a new enum value in the transaction that added it.
- **Deadlines are capped at the end of a day in Addis time:** `end_of_addis_day(d date) = ((d + 1)::timestamp at time zone 'Africa/Addis_Ababa')`.
- **Decline reason keys:** `too_heavy`, `cant_find`, `no_space`, `price_low`, `other`. Labels: "Too heavy", "Can't find it", "Not enough space", "Price too low", "Other".
- **The contact-details error text,** the same in the database and the UI: `please remove phone numbers, @handles, emails and links`.
- **Money:** whole ETB, reward ≥ 1. The receiver only ever sees `total_etb`.
- **Copy:** minimal hint text, Solar icons from `components/icons.tsx` (add new ones from `api.iconify.design/solar.json`), and mobile first.
- **Every task ends green** on:
  - `sh supabase/tests/run.sh`;
  - `node --test lib/*.test.ts`;
  - `npm run lint`.
  - Tasks 4–8 also need `npm run build`.
  - After code changes, run `graphify update .` (per CLAUDE.md).
- **Commits go to the `develop` branch** only when the user says so. This plan's commit steps are local commits; the user pushes. Never commit `.claude/`, `CLAUDE.md`, `skills-lock.json`, `graphify-out/`, `.env` or `next-env.d.ts`.

## Review focus
1. **A double tap or two open tabs.** Accepting, suggesting or paying twice must fail cleanly the second time. Every function locks the request row with `for update` before checking state (tests in Tasks 2 and 3).
2. **The deadline passes between loading the page and tapping.** The function must reject with `time is up`, and the page must reload to show the closed state (tests in Task 2, UI in Task 5).
3. **Contact-pattern false positives.** "iPhone 15 Pro 256GB", "size 42", "2 pcs", "Model A2337" and "1200 ml" must pass. "0911 23 45 67", "+251911234567", "@hana_b", "hana@gmail.com", "wa.me/2519", "t.me/x" and "www.x.com" must be blocked (tests in Tasks 1 and 2, with the same cases).
4. **A trip changes mid-negotiation, or after a screenshot was uploaded.** Requests still being priced close and the receivers are told. A waiting payment becomes a refund card (tests in Tasks 2 and 3).
5. **A migration fails live because of the transaction wrapper** (see Global constraints). `run.sh` runs each migration with `psql -1`, so the tests catch it (Task 2, step 1).

---

### Task 1: Pure logic for negotiation, contact check, stages and payment details

**Files:**
- Create: `lib/negotiation.ts`, `lib/negotiation.test.ts`
- Create: `lib/payment-details.ts`, `lib/payment-details.test.ts`

**Interfaces:**
- Produces, in `lib/negotiation.ts`:
  - `type Side = "receiver" | "traveler"`; re-export `Side` from `lib/sides.ts` if it already exists there.
  - `type DeclineReason = "too_heavy" | "cant_find" | "no_space" | "price_low" | "other"` and `DECLINE_REASONS: { key: DeclineReason; label: string }[]`.
  - `hasContactDetails(text: string): boolean`.
  - `CONTACT_ERROR = "Please remove phone numbers, @handles, emails and links"`.
  - `type OfferView = { status: "pending" | "accepted" | "rejected" | "withdrawn" | "expired" | "closed"; turn: Side; reward_etb: number; suggestion_etb: number | null; suggestions_used: number; due_at: string }`.
  - `type OfferAction = "accept" | "suggest" | "decline" | "accept_suggestion" | "counter" | "withdraw"`.
  - `offerActions(o: OfferView, viewer: Side, now: Date): OfferAction[]`.
  - `suggestionError(raw: string, lastPrice: number, used: number): string | undefined`.
  - `counterError(raw: string, suggestion: number): string | undefined`.
  - `timeLeft(dueIso: string, now: Date): string`.
  - `type Stage = "answer" | "waiting" | "offers" | "no_offers" | "pay" | "checking_payment" | "paid" | "closed"`.
  - `stageLabel(stage: Stage, opts: { counterpart: string | null; offers: number; dueAt: string | null; now: Date }): string`.
- Produces, in `lib/payment-details.ts`:
  - `type PayMethod = "telebirr" | "bank"`.
  - `paymentDetails(env: Record<string, string | undefined>): Partial<Record<PayMethod, { label: string; account: string; name: string }>>`.
  - It reads `NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER`, `NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME`, `NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT` and `NEXT_PUBLIC_ZAKBIS_CBE_NAME`. A method appears only when both of its values are set. The labels are "Telebirr" and "CBE".

- [ ] **Step 1: Write the failing tests** in `lib/negotiation.test.ts`, in the style of `lib/trip-post.test.ts`:
  - **`hasContactDetails`:** true for each blocked case in Review focus 3, false for each allowed case.
  - **`offerActions`**, with the deadline 1 h ahead:
    - receiver's turn with `suggestions_used` 0 → `["accept", "suggest", "decline"]`;
    - the same with `suggestions_used` 3 → `["accept", "decline"]`;
    - the traveler viewing at the receiver's turn → `["withdraw"]`;
    - the traveler's turn → `["accept_suggestion", "counter", "withdraw"]`;
    - the receiver at the traveler's turn → `["decline"]`;
    - a deadline in the past → `[]`;
    - a status other than pending → `[]`.
  - **`suggestionError`:**
    - `("1200", 1200, 0)` → "Suggest less than 1,200 ETB";
    - `("0", 1200, 0)` → "Enter a reward in ETB";
    - `("900", 1200, 3)` → "No suggestions left";
    - `("900", 1200, 2)` → undefined.
  - **`counterError`:**
    - `("900", 900)` → "Name more than 900 ETB, or accept 900 ETB";
    - `("950", 900)` → undefined.
  - **`timeLeft`:** 23 h 10 min → "23 h"; 45 min → "45 min"; past → "Time's up".
  - **`stageLabel`:**
    - `answer` → "Your turn";
    - `waiting` with counterpart "Hana" → "Waiting for Hana";
    - `offers` with 3 → "3 offers";
    - `no_offers` → "No offers yet";
    - `pay` with a due time → `Pay within 5 h`;
    - `checking_payment` → "Checking payment";
    - `paid` → "Paid";
    - `closed` → "Closed".

  Also write `lib/payment-details.test.ts`:
  - an empty env gives `{}`;
  - only the Telebirr pair set gives only `telebirr`;
  - a CBE account without a name leaves out `bank`.

- [ ] **Step 2: Run them to see them fail.**
  Run: `node --test lib/negotiation.test.ts lib/payment-details.test.ts`
  Expected: FAIL (module not found).

- [ ] **Step 3: Implement both modules.**
  - Phone pattern: 7 or more digits once spaces, dots and dashes are removed, with an optional leading `+`.
  - Other patterns: `@` followed by 3 or more word characters, emails, `https?://`, `www.`, `t.me/`, `wa.me/`.
  - Write the pattern so that runs of 6 or fewer digits are allowed (for example "A2337" and "256GB").

- [ ] **Step 4: Run them to see them pass.**
  Run: `node --test lib/*.test.ts`
  Expected: all pass.

- [ ] **Step 5: Commit.** `git add lib/negotiation.* lib/payment-details.* && git commit -m "feat: negotiation and payment-details logic"`

---

### Task 2: Migration 0009, the price back-and-forth, notes and trip changes

**Files:**
- Create: `supabase/migrations/0009_negotiation.sql`
- Create: `supabase/tests/negotiation_test.sql`
- Modify: `supabase/tests/run.sh` (run migrations with `psql -1 -f`)
- Modify: `supabase/tests/helpers.sql` (add `test_accept`)
- Modify: `trip_flow_test.sql`, `open_flow_test.sql`, `hardening_test.sql`, `verification_test.sql`, `storage_test.sql`, `post_trip_test.sql` and `reviews_test.sql` in `supabase/tests/`, wherever they use the old flow (see step 6).

**Interfaces:**
- Consumes: the schema from migrations 0001–0008. These are the latest definitions of the functions this migration replaces:
  - `requests_before_insert`, `make_offer`, `accept_offer` and `advance_request` in 0008;
  - `trips_guard` in 0008.
- Produces, as SQL callable by `authenticated` (each returns `void` unless stated):

  | Function | Who calls it, and what it requires |
  |---|---|
  | `make_offer(p_request uuid, p_trip uuid, p_reward int) returns uuid` | A traveler: on an open request, as before; or on their own trip request that has no offer yet, before `answer_due_at` |
  | `suggest_reward(p_offer uuid, p_reward int)` | The receiver |
  | `counter_offer(p_offer uuid, p_reward int)` | The traveler. `p_reward` must be greater than the suggestion |
  | `accept_offer(p_offer uuid)` | The receiver, at the traveler's current price |
  | `accept_suggestion(p_offer uuid)` | The traveler, at the receiver's suggestion |
  | `decline_offer(p_offer uuid)` | The receiver |
  | `withdraw_offer(p_offer uuid, p_reason text default null)` | The traveler |
  | `decline_request(p_request uuid, p_reason text)` | The traveler on a trip request with no offer |
  | `cancel_request(p_request uuid)` | The receiver |
  | `my_orders(p_side text) returns table (...)` | Either side (columns below) |
  | `mark_notes_read(p_side text)` | Either side |
  | `unread_notes() returns table (side text, n int)` | Either side |

  - **The `my_orders` columns:** `id uuid, kind request_kind, item_name text, quantity int, status request_status, total_etb int, item_etb int, created_at timestamptz, stage text, due_at timestamptz, counterpart text, offers int, my_offer uuid`.
  - **New and changed tables and columns:**
    - **`offers`:** `turn text` (receiver or traveler), `suggestion_etb int`, `suggestions_used int` (0–3), `due_at timestamptz`, `reminded bool`, `decline_reason text`. Statuses add `expired` and `closed`.
    - **`offer_events`:** `(id, offer_id, actor text, kind text, reward_etb int, created_at)`.
    - **`requests`:** `answer_due_at`, `answer_reminded`, `payment_due_at`, `payment_left interval`, `payment_reminded`, `decline_reason`. The status enum adds `expired`.
    - **`notes`:** `(id, user_id, side, request_id, body, read_at, telegram_sent_at, created_at)`.
  - **Internal, not callable by users:**
    - `has_contact(t text) returns boolean`, which is immutable and also used by `trips_guard`;
    - `end_of_addis_day(d date) returns timestamptz`;
    - `notify(p_user uuid, p_side text, p_request uuid, p_body text)`;
    - `settle_offer(o offers, p_reward int)`.
  - **For tests only, in `helpers.sql`:** `test_accept(p_request uuid, p_reward int)` creates an accepted offer and moves the request to `awaiting_payment` with `payment_due_at = now() + 24h`, bypassing the rules. It's for tests that only need an accepted order.

- [ ] **Step 1: Make `run.sh` run each migration as one transaction.** Change `psql -f "$m"` to `psql -1 -f "$m"`.
  Run: `sh supabase/tests/run.sh`
  Expected: every existing test passes. That proves 0001–0008 survive `begin`/`commit`.

- [ ] **Step 2: Write `supabase/tests/negotiation_test.sql`** in the style of `post_trip_test.sql`, with `must_fail` and fixed ids. The cast is:
  - an admin;
  - receiver Meron;
  - verified traveler Hana with a live AE trip;
  - verified traveler Dawit with a live AE trip;
  - a stranger;
  - fx AED 38.5.

  Assertions, in order:
  1. **Trip request saves without a reward.**
     - An insert with `reward_etb = 800` stores `reward_etb is null`.
     - `answer_due_at` is between `now() + 47h` and `now() + 48h`, or the end of the shop-by day if that's sooner.
     - Hana gets one `traveler` note.
  2. **Contact details are rejected:**
     - `item_name` "call 0911 234 567" fails with `please remove phone numbers`;
     - `notes` "@hana_b" fails the same way;
     - `item_name` "iPhone 15 Pro 256GB" saves;
     - a trip `note` of "wa.me/251911" fails.
  3. **Only the trip's traveler names the price:**
     - Dawit calling `make_offer` on Hana's trip request fails;
     - Hana naming a price with Dawit's trip fails;
     - `make_offer(req, hana_trip, 1200)` works;
     - the offer has `turn = 'receiver'` and `due_at` about 24h away;
     - one `price` event exists;
     - Meron gets a note;
     - a second `make_offer` from Hana fails with `already`.
  4. **Suggestion rules:**
     - Hana calling `suggest_reward` fails (out of turn);
     - Meron suggesting 1200 fails with `lower`;
     - Meron suggests 900 → `turn = 'traveler'`, `suggestions_used = 1`;
     - Meron suggesting again fails with `not your turn`.
  5. **Counter rules:**
     - `counter_offer(900)` fails with `more than`;
     - `counter_offer(1000)` works;
     - after two more rounds (Meron suggests 950 and 960, and Hana counters each), `suggestions_used = 3`;
     - a fourth suggestion fails with `no suggestions left`.
  6. **Time is up:** set `offers.due_at = now() - interval '1 minute'` as the superuser; then `accept_offer` fails with `time is up`; restore it.
  7. **Accept:**
     - `accept_offer` → the request is `awaiting_payment`, `reward_etb` is the current price, `payment_due_at` is ≤ 24h away, and both sides get notes;
     - calling it again fails with `no longer`.
  8. **Accept a suggestion:** on a second trip request, after Hana names 500 and Meron suggests 400, `accept_suggestion` sets `reward_etb = 400`.
  9. **Open request:**
     - Hana and Dawit both offer;
     - each sees only their own offer row and its events (`select count(*) from offers` = 1 as each);
     - Meron sees 2;
     - Meron accepts Dawit's → Hana's offer is `closed` with a `close` event, and Hana gets a note containing "another traveler".
  10. **One offer per traveler, ever:** on a new open request, after Hana withdraws her offer, `make_offer` from Hana fails with `already`.
  11. **Decline:**
      - `decline_request(req, 'nonsense')` fails;
      - `decline_request(req, 'too_heavy')` → the request is `declined`, `decline_reason = 'too_heavy'`, and Meron gets a note;
      - on a trip request whose offer Meron declines (`decline_offer`), the request is `declined`.
  12. **Cancel:**
      - Meron's `cancel_request` on an open request with a pending offer → `cancelled`, the offer is `closed`, and the traveler gets a note;
      - the stranger calling `cancel_request` fails.
  13. **Trip changes:**
      - with a pending trip request and a pending open-request offer on Hana's trip, Hana changes `arrival_date` (the trip goes to checking) → the request is `cancelled`, the offer is `closed`, and Meron gets two notes;
      - on another live trip with a `paid` request (set by the superuser), `update trips set status = 'cancelled'` fails with `paid orders`, and `free_kg` can still change.
  14. **`my_orders`:**
      - `my_orders('receiver')` as Meron includes the open request with `stage = 'offers'` and `offers = 2` while two are pending;
      - `my_orders('traveler')` as Hana shows a fresh trip request with `stage = 'answer'`.
  15. **Notes are private:**
      - as Dawit, `select count(*) from notes where user_id <> auth.uid()` is 0;
      - `mark_notes_read('traveler')` sets `read_at`;
      - `unread_notes()` returns 0 for that side.
  16. **Old paths are gone:**
      - `advance_request(req, 'awaiting_payment')` fails with `use`;
      - `advance_request(req, 'paid')` fails with `use`;
      - inserting into `offer_events` and `notes` directly as `authenticated` fails.

- [ ] **Step 3: Run it to see it fail.**
  Run: `sh supabase/tests/run.sh`
  Expected: `FAIL negotiation_test.sql` (the functions don't exist yet).

- [ ] **Step 4: Write `0009_negotiation.sql`.** The decisions the tests don't fix:
  - **Remove the old `requests` check.** Find the `kind` check by its definition, `select conname from pg_constraint where conrelid = 'requests'::regclass and pg_get_constraintdef(oid) like '%kind = ''trip''%'`, drop it in a `do` block, and add it back without `reward_etb is not null`. Replace `offers_status_check` the same way.
  - **Allow only one offer per traveler per request, ever.** Drop `offers_one_live_per_traveler` and add `create unique index offers_one_per_traveler on offers (request_id, traveler_id)`.
  - **Break the policy loop with a function.** RLS policies that refer to each other recurse forever. Let the traveler read requests they have an offer on through a security-definer `has_offer_on(p_request uuid)` used in the `visible requests` policy. `offer_events` uses `can_see_offer(p_offer uuid)` in the same way.
  - **Lock first.** Every action function locks the request row (`select ... for update`) before checking state. They check, in order: who is calling (`only the receiver` / `only the traveler`), the status (`no longer`), the turn (`not your turn`), then the deadline (`time is up`).
  - **Due times:**
    - **A pricing turn:** `least(now() + 24h, end_of_addis_day(trip.shop_by), end_of_addis_day(r.needed_by))`. Leave out `needed_by` when it's null.
    - **The traveler's first answer:** `least(now() + 48h, end_of_addis_day(trip.shop_by))`.
    - **Payment:** `least(now() + 24h, end_of_addis_day(trip.shop_by))`.
    - **Reminders:** when a deadline is set, set its reminded flag to true if the window is already within the reminder lead (4h for turns and payment, 24h for the first answer). That way a short window doesn't send a reminder right away.
  - **`settle_offer`:**
    - sets `traveler_id`, `trip_id`, `reward_etb`, `status = 'awaiting_payment'`, `accepted_at`, `payment_due_at` and `payment_reminded`;
    - marks the offer `accepted`;
    - marks other pending offers `closed`, with a `close` event and a note to each traveler;
    - writes an `accept` event;
    - sends notes to both sides;
    - and keeps the live-trip and verified-traveler re-checks from 0008's `accept_offer`.
  - **When a trip request's only offer ends** (rejected or withdrawn), the request becomes `declined`.
  - **`trips_guard`** (replace the 0008 definition, keeping all its rules):
    - raises `this trip has paid orders` on a cancel or a re-check change while any request on the trip is `paid`, `purchased` or `landed`;
    - raises the contact error on `note`.
  - **A new `after update` trigger `trips_after_change`:** when `status` moves to `checking` or `cancelled` from something else, it closes:
    - trip requests in `open`;
    - `awaiting_payment` requests without a pending escrow (they become `cancelled`);
    - pending offers that use the trip (they become `closed`).

    It also writes a note to each receiver: "{traveler}'s trip changed, so your request for {item} closed."
  - **`advance_request`:** keep the 0008 body, but make `awaiting_payment`, `declined` and `paid` raise `use make_offer / decline_request / decide_payment`. The receiver `cancelled` branch is removed, so only admins cancel through it.
  - **Drop `reject_offer`,** which `decline_offer` replaces.
  - **Note text:** use the traveler's `traveler_names.given_name` and the receiver's `profiles.first_name`. Examples:
    - "Hana named 1,200 ETB for Perfume";
    - "Meron suggested 900 ETB for Perfume";
    - "Meron accepted 1,000 ETB for Perfume. Pay within 24 h.";
    - "Reminder: 4 h left to answer Meron about Perfume".

    Format numbers with `to_char(n, 'FM999,999,999')`.
  - **`my_orders(p_side)`:**
    - **receiver:** the caller's requests;
    - **traveler:** trip requests where the caller is the traveler, plus requests the caller has an offer on.
    - **`stage`, from the viewer's side:**
      - `answer`: the viewer must act;
      - `waiting`: the other side must act;
      - `offers` / `no_offers`: an open request, viewed by its receiver;
      - `pay`: awaiting payment with no pending escrow;
      - `checking_payment`;
      - `paid`: paid or later;
      - `closed`: anything else, including a traveler whose offer ended.
    - **`due_at`:** the deadline that matters for that stage.

- [ ] **Step 5: Add `test_accept` to `helpers.sql`.** It runs as the owner and sets the offer and request fields the way `settle_offer` would.

- [ ] **Step 6: Move the existing tests to the new flow**, keeping each test's intent:
  - **The traveler moving a request to `awaiting_payment`:** replace `advance_request(..., 'awaiting_payment')` with `make_offer(req, trip, <reward>)` as the traveler, then `accept_offer` as the receiver. Where a test only needs an accepted order, use `test_accept(req, 800)`. That covers `trip_flow`, `storage`, `hardening` and `verification`.
  - **The traveler declining:** replace `advance_request(..., 'declined')` with `decline_request(req, 'other')`.
  - **The receiver cancelling:** replace `advance_request(..., 'cancelled')` with `cancel_request(req)`.
  - **`open_flow`:**
    - change the expected fee assertion `(600, 54, 'awaiting_payment')` to read the reward from the accepted offer, which is unchanged;
    - expect the other offer to be `closed`, not `rejected`.
  - **Leave payment inserts and `advance_request(..., 'paid')` alone in this task.** Task 3 moves them. Steps that exercise the 0008 "re-checked trip" paths keep their assertions (`no longer`, `trip not found`).

- [ ] **Step 7: Run everything.**
  Run: `sh supabase/tests/run.sh`
  Expected: every file PASSes, including `negotiation_test.sql`.

- [ ] **Step 8: Commit.** `git add supabase && git commit -m "feat: price back-and-forth, notes and trip-change closing (0009)"`

---

### Task 3: Migration 0010, payments, deadlines, the Telegram outbox and rate seeds

**Files:**
- Create: `supabase/migrations/0010_payments_deadlines.sql`
- Create: `supabase/tests/payment_test.sql`, `supabase/tests/deadlines_test.sql`
- Create: `supabase/live/telegram_cron.sql`. This is not a migration and not in the tests; the user runs it once.
- Modify: `supabase/tests/helpers.sql` (add `test_pay`), and the tests that still insert `payments` directly or call `advance_request(..., 'paid')`.

**Interfaces:**
- Consumes, from Task 2:
  - `notify`, `end_of_addis_day`;
  - the `requests.payment_due_at`, `payment_left` and `payment_reminded` columns;
  - the offer `due_at` and `reminded` columns;
  - `requests.answer_due_at` and `answer_reminded`.
- Produces, callable by `authenticated`:

  | Function | Who calls it, and what it does |
  |---|---|
  | `submit_payment(p_request uuid, p_method text, p_proof text) returns uuid` | The receiver |
  | `decide_payment(p_payment uuid, p_approve boolean, p_reason text default null)` | An admin |
  | `mark_refunded(p_payment uuid)` | An admin |
  | `payments_to_check() returns table (...)` | Admins (columns below) |

  - **The `payments_to_check` columns:** `id uuid, request_id uuid, item_name text, quantity int, amount_etb int, method text, proof_path text, created_at timestamptz, receiver_name text, traveler_name text, trip_changed boolean`.
  - **Internal (revoked from users):** `run_deadlines()`, `telegram_outbox(p_limit int default 50) returns table (note_id uuid, chat_id bigint, text text)`, and `mark_telegram_sent(p_ids uuid[])`.
  - **`payments`** gains `method text` (telebirr or bank), `reject_reason text`, `decided_at timestamptz` and `decided_by uuid`. Statuses add `refunded`.
  - **For tests only:** `test_pay(p_request uuid)` inserts a confirmed escrow payment and sets the request to `paid`.

- [ ] **Step 1: Write `supabase/tests/payment_test.sql`.** Use the same cast, and reach `awaiting_payment` through `make_offer` and `accept_offer` (not `test_accept`), so the whole path is covered once:
  1. **Paying:**
     - the traveler or a stranger calling `submit_payment` fails;
     - a method of `cash` fails;
     - a proof in someone else's folder fails;
     - a proof with no `storage.objects` row in `proofs` fails;
     - the receiver pays with Telebirr and a real object → a pending escrow exists, `amount_etb = total_etb`, `payment_left` is about 24h, and the traveler gets a note;
     - a second `submit_payment` fails with `already`;
     - a direct `insert into payments` as `authenticated` fails.
  2. **Waiting:** while it waits, setting `payment_due_at` into the past and calling `run_deadlines()` leaves the request `awaiting_payment`, because the clock is stopped.
  3. **Checking:**
     - the receiver calling `decide_payment` fails with `admins only`;
     - rejecting without a reason fails;
     - rejecting with "Blurry" → the payment is `rejected`, `payment_due_at` is ≥ `now() + 2h`, and the receiver's note contains "Blurry";
     - re-uploading creates a new pending row;
     - deciding the old payment id fails with `not waiting`;
     - approving the new one → the request is `paid`, and both sides get notes (the traveler's contains "shopping").
  4. **Trip changed:**
     - on a second order whose screenshot is waiting, Hana's trip goes to checking (an `arrival_date` edit);
     - the request stays `awaiting_payment`;
     - `payments_to_check()` shows `trip_changed = true`;
     - `decide_payment(..., true)` fails with `refund instead`;
     - `mark_refunded` → the payment is `refunded`, the request is `cancelled`, and the receiver gets a note;
     - `mark_refunded` on a payment whose trip is live fails with `trip is live`.
  5. **Admins only:** the receiver calling `payments_to_check()` fails with `admins only`.

  Then write `supabase/tests/deadlines_test.sql`, which sets due times with superuser updates and calls `select run_deadlines()`:
  - **A trip request with no answer:**
    - `answer_due_at` 23h away → one reminder note to the traveler;
    - a second `run_deadlines()` adds no second note;
    - past due → the request is `expired`, and both sides get notes.
  - **A pending offer:**
    - due in 3h with `reminded = false` → a reminder to the side whose turn it is;
    - past due → the offer is `expired`;
    - on a trip request, the request is also `expired`;
    - on an open request, the request stays `open`.
  - **An open request past `needed_by`:** set `needed_by = addis_today() - 1` as the superuser (the check constraint is on inserts only) → the request is `expired`, and its pending offers are `closed`.
  - **Payment:**
    - 3h left with no proof → a reminder;
    - past due with no proof → `cancelled`, and both sides get notes.
  - **The outbox:**
    - `telegram_outbox()` returns only notes for users with a `telegram_links` row, unsent, and less than a day old;
    - `text` ends with `https://app.zakbis.com/orders/requests/<request_id>`;
    - after `mark_telegram_sent`, those notes aren't returned again;
    - `authenticated` calling `run_deadlines()` or `telegram_outbox()` fails with `permission denied`.
  - **Exchange rates:** `select count(*) from fx_rates` is 4 after the migrations.

- [ ] **Step 2: Run the tests to see them fail.**
  Run: `sh supabase/tests/run.sh`
  Expected: FAIL for both new files.

- [ ] **Step 3: Write `0010_payments_deadlines.sql`.** The decisions the tests don't fix:
  - **Drop the policy `receiver uploads escrow proof`.** `submit_payment` replaces it and doesn't require `my_phone_confirmed()` (spec).
  - **`submit_payment`:**
    - locks the request;
    - requires `awaiting_payment`, `payment_due_at >= now()` and no pending escrow;
    - requires the proof's first folder to be the caller and the object to exist in `storage.objects` with `bucket_id = 'proofs'`;
    - stores `payment_left = payment_due_at - now()`.
  - **`decide_payment`:** the payment must be `pending` and `escrow`, or it raises `this payment is not waiting for a check`.
    - **Approve:** requires the trip to be `live` (otherwise `the trip changed: refund instead`), confirms the payment, sets the request to `paid`, and stamps `decided_*`.
    - **Reject:** requires a reason, sets `payment_due_at = now() + greatest(payment_left, interval '2 hours')`, and resets `payment_reminded` the way Task 2 does.
  - **`mark_refunded`:** requires the trip not to be `live` (otherwise `the trip is live: confirm or reject instead`).
  - **`run_deadlines()`** does the steps in the deadline table of the spec, in this order: trip-request expiry, trip-request reminders, offer expiry, offer reminders, open-request expiry, payment expiry, payment reminders. Each step is a set-based `update ... returning` feeding `notify`, and reminders set their flag so they fire once.
  - **`telegram_outbox`:** joins `notes` to `telegram_links` on `user_id`; `chat_id = telegram_id`. It returns notes oldest first.
  - **Seed the rates:** `insert into fx_rates (currency, etb_per_unit) values ('USD', 141.4), ('GBP', 180), ('CNY', 19.9), ('AED', 38.5) on conflict (currency) do nothing;`

- [ ] **Step 4: Add `test_pay` to `helpers.sql`, and move the remaining old payment paths:**
  - in `trip_flow`, `open_flow`, `hardening` and `verification`, replace `insert into payments ... escrow` plus `advance_request(..., 'paid')` with `submit_payment` plus `decide_payment(..., true)`. Use `test_pay` where the test is about later steps;
  - in `trip_flow`, the old check that the receiver must have a confirmed phone to upload becomes: the receiver can pay without a confirmed phone.

- [ ] **Step 5: Run everything.**
  Run: `sh supabase/tests/run.sh`
  Expected: every file PASSes.

- [ ] **Step 6: Write `supabase/live/telegram_cron.sql`.** It isn't run by the tests. Its header comment lists the user's steps:
  1. Supabase Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
  2. In the SQL editor, run `select vault.create_secret('<bot token>', 'telegram_bot_token');`. The user pastes the token themselves.
  3. Run this file inside `begin;`/`commit;`.

  The file contains:
  - **`send_telegram()`,** a security-definer function that:
    - reads the token from `vault.decrypted_secrets`;
    - for each `telegram_outbox(50)` row, calls `net.http_post(url := 'https://api.telegram.org/bot' || token || '/sendMessage', body := jsonb_build_object('chat_id', chat_id, 'text', text, 'disable_web_page_preview', true))`;
    - then calls `mark_telegram_sent` on the rows it queued, whether or not Telegram accepted them (the spec says "doesn't retry forever");
    - is revoked from `anon` and `authenticated`.
  - **The schedule:** `select cron.schedule('zakbis-every-minute', '* * * * *', 'select run_deadlines(); select send_telegram();');`

- [ ] **Step 7: Commit.** `git add supabase && git commit -m "feat: manual payments, server deadlines, Telegram outbox (0010)"`

---

### Task 4: Explore and the request forms use real data

**Files:**
- Create: `lib/trips.ts`, `lib/trips.test.ts`, `components/request/save-request.ts`
- Modify:
  - pages: `app/page.tsx`, `app/trips/[id]/page.tsx`, `app/trips/[id]/request-form.tsx`, `app/post/page.tsx`, `app/post/post-request-form.tsx`;
  - components: `components/trip-tag.tsx`, `components/request/item-fields.tsx`;
  - lib: `lib/open-requests.ts`, `lib/money.ts`.
- Delete: `lib/sample-data.ts`, after moving `originCurrency` to `lib/money.ts` and `Country` to `lib/open-requests.ts`.

**Interfaces:**
- Consumes:
  - the `trips` select columns and `status` (0008);
  - the views `traveler_names(traveler_id, given_name)` and `traveler_stats(traveler_id, rating, review_count, deliveries, verified)`;
  - `profiles.photo_blur_path` (public bucket `photos-blur`);
  - `fx_rates(currency, etb_per_unit)`;
  - `CONTACT_ERROR` and `hasContactDetails` from Task 1.
- Produces:
  - `type TripCard = { id; travelerName; verified; deliveries; originCountry: Country; originCity; originAirport; shopBy; arrivalDate; freeKg: number; photoUrl: string | null; rating: number; reviewCount: number }`;
  - `toTripCard(trip, name, stats, photoUrl): TripCard` in `lib/trips.ts`;
  - `loadTripCards(supabase, opts?: { id?: string }): Promise<TripCard[]>` in `lib/trips.ts`. It queries live trips with `shop_by >= addisToday`, then names, stats and photos for those traveler ids in three `in()` queries;
  - `useItemFields(defaultCurrency, rates: Record<Currency, number>)`;
  - `saveRequest(input): Promise<{ id: string } | { error: string }>` in `components/request/save-request.ts`. It uploads the screenshot to `screenshots/<uid>/<uuid>.<ext>`, inserts the request, and maps database errors (`please remove` → `CONTACT_ERROR`, `trip is not available` → "This trip is no longer taking requests", anything else → "Couldn't send. Please try again.").

- [ ] **Step 1: Write the failing test** in `lib/trips.test.ts`:
  - `toTripCard` maps snake_case rows;
  - a missing name falls back to "Traveler";
  - null stats give rating 0, reviewCount 0, deliveries 0, verified false;
  - `photoUrl` passes through as null.

  Add `hasContactDetails` usage cases only if Task 1 didn't already cover them.

- [ ] **Step 2: Run it to see it fail.**
  Run: `node --test lib/trips.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.**
  - **Server pages** (`app/page.tsx`, `app/trips/[id]/page.tsx`) use `createClient` from `lib/supabase/server` with `loadTripCards`. The trip page uses `notFound()` when no card comes back. Reviews come from `reviews`, with the subject being the traveler and the author's first name from `profiles`. The "· sample" text is removed.
  - **Rates** are fetched on the server, in `app/trips/[id]/page.tsx` and `app/post/page.tsx`, and passed as a prop.
  - **`TripTag`** takes a `TripCard` and shows the `User` icon when `photoUrl` is null.
  - **`RequestForm`:**
    - no reward field or reward row;
    - the summary shows the item price and "Reward: {name} names it";
    - a contact-details check on the item name and notes, before sending;
    - Send calls `requireAuth`, then `saveRequest({ kind: "trip", trip_id, ... })`;
    - the success view shows the heading "Request sent to {name}", the line "{name} has 48 hours to answer.", and a "See your request" link to `/orders/requests/<id>`;
    - the send-bar note becomes "You won't pay anything until you accept a price".
  - **`PostRequestForm`:** the same save path, with `kind: "open"`, `countries` and `needed_by`. Its success link goes to `/orders/requests/<id>`.

- [ ] **Step 4: Run every check.**
  Run: `node --test lib/*.test.ts && npm run lint && npm run build`
  Expected: all pass, and nothing imports `sample-data`.

- [ ] **Step 5: Commit.** `git add -A app lib components && git commit -m "feat: Explore and request forms use real trips and save"`

---

### Task 5: Orders lists and the order page, with the price back-and-forth

**Files:**
- Create: `components/orders/order-list.tsx`, `app/orders/requests/[id]/page.tsx`, `app/orders/requests/[id]/order-detail.tsx`, `components/orders/offer-card.tsx`
- Modify: `app/orders/orders-panel.tsx`, `app/orders/trips/[id]/trip-detail.tsx` and `components/trips/trip-form.tsx`. Errors containing `paid orders` show "This trip has paid orders. Contact support to change it." instead of the generic error.

**Interfaces:**
- Consumes:
  - from Task 2: `my_orders(p_side)`, the actions in its Produces block, and the `offers` and `offer_events` columns;
  - from Task 1: `offerActions`, `suggestionError`, `counterError`, `timeLeft`, `stageLabel`, `DECLINE_REASONS` and `CONTACT_ERROR`.
- Produces:
  - `<OrderList side="receiver" | "traveler" />`;
  - `<OrderDetail id />`, which gets a `paymentSlot` place where Task 7 mounts `<PaymentSection />`.

- [ ] **Step 1: Write `OrderList`.**
  - It calls `rpc("my_orders", { p_side })`.
  - It sorts `stage === "answer"` first, then `created_at` newest first.
  - Each row shows the item name, quantity and a chip from `stageLabel` (brand-coloured when it's your turn), and links to `/orders/requests/<id>`.
  - Empty state: "No orders yet". On a load error: "Couldn't load your orders. Please reload."
  - In `OrdersPanel`, the receiver gets `<OrderList side="receiver" />` and the traveler's Orders tab gets `<OrderList side="traveler" />`.

- [ ] **Step 2: Write `OrderDetail`, a client component without `SideGate`, since either side may open it.** It loads:
  - the request row;
  - its offers (row-level security limits what each side sees);
  - the events for those offers;
  - the traveler names (`traveler_names`) and the receiver's first name;
  - the latest `payments` row.

  The first `requireAuth` happens on mount, so a signed-out tap from Telegram gets the sign-in sheet. The page renders:
  - **A header:** the item, quantity, link or screenshot thumbnail, item ETB, and the current total once a price exists.
  - **Traveler, trip request with no offer:**
    - the reward input plus "Send price", which calls `make_offer(id, trip_id, reward)`;
    - "Decline" opens the reason list, then calls `decline_request`;
    - the deadline reads "Answer within {timeLeft(answer_due_at)}".
  - **For each offer visible to the viewer, an `OfferCard`:**
    - the traveler's name;
    - the history ("Hana: 1,200 ETB · You suggested 900 ETB · …", with "You" for the viewer);
    - the time left;
    - the action buttons from `offerActions`;
    - the inputs for suggest and counter, with inline errors from `suggestionError` and `counterError`, and "{3 - used} suggestions left";
    - decline and withdraw with the reason list (a reason is required for the traveler's withdraw, and the receiver declines without one).
  - **Receiver:** "Cancel request", confirmed with "Cancel this request?" / "Keep it", shown while the stage is `answer`, `waiting`, `offers`, `no_offers` or `pay`.
  - **Closed states:** "Closed: {reason}", for example "Hana declined: Too heavy", "No answer in time", "You cancelled", "The trip changed" or "The receiver chose another traveler".
  - **Every action** calls the RPC and then reloads. On an error it shows `role="alert"` text and reloads, so a `time is up` or `no longer` error shows the fresh state.

- [ ] **Step 3: Run every check.**
  Run: `npm run lint && npm run build`
  Expected: pass.

- [ ] **Step 4: Browser walk-through with playwright-cli in mobile mode,** with throwaway Telegram test accounts as in earlier pieces. The receiver sends a trip request; the traveler names 1,200; the receiver suggests 900; the traveler counters 1,000; the receiver accepts. Check that both Orders lists show the right chips.

- [ ] **Step 5: Commit.** `git add app/orders components/orders && git commit -m "feat: orders lists and order page with price back-and-forth"`

---

### Task 6: The traveler's Explore and making an offer

**Files:**
- Modify: `app/requests/page.tsx`
- Create: `app/requests/open-requests-list.tsx`, `app/requests/[id]/page.tsx`, `app/requests/[id]/make-offer.tsx`
- Modify: `lib/open-requests.ts` (`isVisibleToTrip` takes `{ originCountry; arrivalDate; shopBy }`; update its test)

**Interfaces:**
- Consumes:
  - `my_trips()` (0008);
  - `requests` rows visible under the existing policy;
  - `make_offer` (Task 2);
  - `loadMyVerification` and `VerificationStatus`;
  - `isVisibleToTrip`.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Update the `isVisibleToTrip` test** to use the new trip shape.
  Run `node --test lib/open-requests.test.ts` and see it fail on the type or shape, then update the function and see it pass.

- [ ] **Step 2: Write `OpenRequestsList`.**
  - **Not verified:** show `VerificationStatus`.
  - **Verified:** load the caller's live trips (`status === "live"` and `shop_by >= today`), the open requests (`kind = 'open'`, `status = 'open'`, `needed_by >= today`, not the caller's own), and the caller's offers.
    - Show the requests that some live trip matches and that the caller hasn't offered on.
    - Each card shows the item, quantity, item ETB, countries (`countryLabel`), "Needed by {d MMM}", and the receiver's first name and photo (`receiverPhotoSrc`). It links to `/requests/<id>`.
  - **No live trips:** "Post a trip to make offers", linking to `/trips/new`.
  - **No matches:** "No open requests for your trips yet".

- [ ] **Step 3: Write `MakeOffer`** on the request page.
  - The request details are as on the card, plus notes and the link or screenshot.
  - **The trip picker** shows only when more than one matching live trip exists, labelled `{countryLabel} · lands {d MMM}`.
  - **The reward input** has the error "Enter a reward in ETB".
  - **"Send offer"** calls `rpc("make_offer", ...)`, then `router.push("/orders/requests/<id>")`. On an `already` error it shows "You already offered on this request".

- [ ] **Step 4: Run every check.**
  Run: `node --test lib/*.test.ts && npm run lint && npm run build`
  Expected: pass.

- [ ] **Step 5: Browser walk-through.** The receiver posts an open request for AE; two traveler accounts with live AE trips offer; the receiver accepts one; the other sees "Closed: The receiver chose another traveler".

- [ ] **Step 6: Commit.** `git add app/requests lib/open-requests* && git commit -m "feat: traveler Explore of open requests and offers"`

---

### Task 7: The payment screen and the admin payment queue

**Files:**
- Create: `components/orders/payment-section.tsx`, `app/admin/payments/page.tsx`, `app/admin/payments/payment-queue.tsx`
- Modify:
  - `app/orders/requests/[id]/order-detail.tsx` (mount the section);
  - `app/admin/trips/trip-queue.tsx` and `app/admin/verifications/*` (cross-links).

**Interfaces:**
- Consumes:
  - from Task 3: `submit_payment`, `decide_payment`, `mark_refunded` and `payments_to_check()`;
  - from Task 1: `paymentDetails(process.env)` and `timeLeft`.

  Read the env values as literal `process.env.NEXT_PUBLIC_…` references so Next inlines them.
- Produces: nothing later tasks rely on.

- [ ] **Step 1: Write `PaymentSection`,** shown to the receiver while the request is `awaiting_payment`.
  - **No methods configured:** "Payment opens soon."
  - **Otherwise:**
    - a Telebirr / CBE toggle (only the configured methods);
    - the account number and name, each with a Copy button (`navigator.clipboard.writeText`, showing "Copied");
    - the exact `total_etb`;
    - "Pay within {timeLeft(payment_due_at)}";
    - a screenshot upload (JPEG, PNG or WebP) to `proofs/<uid>/<uuid>.<ext>`;
    - "Send screenshot", which calls `submit_payment`.
  - **The latest payment is pending:** "We're checking your payment."
  - **The latest payment was rejected:** "We couldn't confirm your payment: {reject_reason}", with the upload form again.
  - **The traveler,** while the request is `awaiting_payment`, sees "Waiting for {receiver} to pay".
  - **Both sides,** once it's `paid`, see "Paid. {traveler} will go shopping." The traveler sees "Paid. Go shopping for {item}."

- [ ] **Step 2: Write the admin page.** It's modelled on `app/admin/trips/page.tsx` and `trip-queue.tsx`, with the same admin check and layout.
  - **Each card shows:** the item × quantity, the receiver → traveler names, the amount, the method, how long it has been waiting, and the screenshot inline (a signed URL from the `proofs` bucket, 3600 s).
  - **Normal cards:** Confirm, and Reject with a required reason.
  - **When `trip_changed`:** the line "Trip changed: refund the receiver" and a single **Mark refunded** button (with a confirm).
  - **Stale cards:** errors containing `not waiting` show "This payment changed. Reload to see the new version."
  - **Links** go between Payments, Trip checks and Verifications.

- [ ] **Step 3: Run every check.**
  Run: `npm run lint && npm run build`
  Expected: pass.

- [ ] **Step 4: Browser walk-through,** with test values in `.env.local` that are never committed. The receiver pays with Telebirr; the admin rejects with "Blurry"; the receiver re-uploads; the admin confirms; both sides see Paid. Then a second order: the screenshot is uploaded, the traveler changes the date, and the admin sees the refund card and marks it refunded.

- [ ] **Step 5: Commit.** `git add components/orders app/admin app/orders && git commit -m "feat: manual payment screen and admin payment checks"`

---

### Task 8: The Inbox, the tab dot and Telegram permission

**Files:**
- Create: `app/inbox/inbox-list.tsx`
- Modify: `app/inbox/page.tsx`, `components/tab-bar.tsx`, `components/auth/telegram-button.tsx`

**Interfaces:**
- Consumes:
  - from Task 2: the `notes` table (row-level security limits it to the owner), `mark_notes_read(p_side)` and `unread_notes()`;
  - `useSide()`, and `user.app_metadata.telegram_id` (the same check as `app/profile/sign-in/sign-in-panel.tsx`).
- Produces: nothing.

- [ ] **Step 1: Write `InboxList`.**
  - It loads the active side's notes, newest first, limited to 100.
  - Unread notes are bold, with a dot.
  - Each note links to `/orders/requests/<request_id>` and shows a relative time.
  - **Other side:** if `unread_notes()` shows unread notes for the other side, a top row reads "{n} new on your {traveling|receiving} side" and switches sides when tapped. Use the existing side-switch path in `components/auth`.
  - **After rendering,** call `mark_notes_read(side)` once.
  - **With no notes:** "No updates yet".
  - **Telegram link:** users with a Telegram link see "Get updates on Telegram" → `https://t.me/ZakbisBot?start=updates`. Users without one see "Connect Telegram for updates" → `/profile/sign-in`.

- [ ] **Step 2: Add the tab dot.** `TabBar` calls `unread_notes()` on mount; the Tabs remount on each page because `AppShell` is per page. It shows a small dot on the Inbox icon when the active side has unread notes, with the accessible name "Inbox, new updates".

- [ ] **Step 3: Request write access.** In `TelegramButton`, add `script.setAttribute("data-request-access", "write")`.

- [ ] **Step 4: Run every check.**
  Run: `npm run lint && npm run build && node --test lib/*.test.ts && sh supabase/tests/run.sh`
  Expected: all pass.

- [ ] **Step 5: Browser walk-through.** After Task 5's flow, the traveler's Inbox lists the notes, the dot clears after opening the Inbox, and the other-side line switches sides.

- [ ] **Step 6: Commit.** `git add app/inbox components && git commit -m "feat: Inbox, unread dot, Telegram write access"`

---

## After the last task (for the user, listed in the final message)
1. **Check that the live `requests`, `offers` and `payments` tables are empty.**
2. **Apply the migrations** `0009` then `0010` in the Supabase SQL editor, each wrapped in `begin;`/`commit;`.
3. **Turn on the add-ons and the bot token:** enable `pg_cron` and `pg_net`, add the Vault secret `telegram_bot_token`, then run `supabase/live/telegram_cron.sql` inside `begin;`/`commit;`.
4. **Add the payment details to Vercel** for the develop branch when you have them: `NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER`, `NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME`, `NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT`, `NEXT_PUBLIC_ZAKBIS_CBE_NAME`. Then redeploy.
5. **Run the phone checklist** on app.zakbis.com.
