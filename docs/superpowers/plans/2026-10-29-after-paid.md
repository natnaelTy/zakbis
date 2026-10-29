# After Paid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry a paid order through bought (receipt + item photo, receiver check, swap), "I'm in Addis" (fresh SMS code, phone reveal), handover code, and manual payout or refund, with deadlines so no order gets stuck, and Zakbis's cut moved to 15%.

**Architecture:** One migration, `0011_after_paid.sql`, built up task by task. It adds columns on `requests`, security-definer functions per action, admin queue functions, and new steps in `run_deadlines()` (the existing every-minute cron already calls it, so the cron doesn't change). SMS codes go through two Next.js API routes, which use the service-role client to confirm the phone in Supabase Auth, where `phone_of()` reads it. They then call a service-only `mark_in_addis`. The UI adds an after-paid section to the order detail, a phone-code component and an admin **Orders** page.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind/shadcn, Supabase (Postgres 16, RLS, Storage, Auth admin API), AfroMessage HTTP API.

**Spec:** `docs/superpowers/specs/2026-10-29-after-paid-design.md`

## Global Constraints
- **The cut is 15%** on the reward only (`settings.fee_pct = 15`). Existing rows are set to 15 too (user: "15% for all orders"). Each order is locked at `settle_offer` time.
- **Status changes go only through security-definer functions** that lock the request (`for update`) and check, in this order: caller, status ("no longer valid"), hold ("on hold"), deadline ("time is up"). Internal helpers are revoked from public, anon and authenticated.
- **No status column is set from the browser.** Files must exist in the `proofs` bucket under the caller's own folder.
- **Deadlines:**
  - photo check: `least(now() + 24h, buy_due)`;
  - buying and swapping: `buy_due` = `coalesce(buy_due_at, end_of_addis_day(trip.shop_by))`;
  - "Give 2 more days": `now() + 2 days`;
  - handover window: 7 days from "I'm in Addis"; "Restart the week" means `now() + 7 days`;
  - traveler no-show: `addis_today() > arrival_date + 7`.
  - Every deadline step skips orders where `hold is not null`.
- **"Not right" reasons:** `wrong_color` (Wrong color), `wrong_model` (Wrong model), `wrong_size` (Wrong size), `not_asked` (Not what I asked for), `other` (Other).
- **Hold kinds:** `not_bought`, `item_problem`, `cant_reach`, `no_receiver_phone`.
- **Admin actions:**
  - `not_bought`: `refund` or `extend`;
  - `cant_reach`: `refund` or `restart`;
  - `item_problem` and `no_receiver_phone`: `refund` or `pay`.
- **SMS:**
  - Ethiopian mobile numbers only, normalized to `2519XXXXXXXX` or `2517XXXXXXXX`.
  - 6-digit codes, stored as sha256 of `code:user_id`, expiring after 10 minutes, with 5 tries. Sends are limited to one every 60 s and 3 per 15 min per user.
  - **Live mode** needs `AFROMESSAGE_TOKEN`, `AFROMESSAGE_IDENTIFIER` and `AFROMESSAGE_SENDER`.
  - **Test mode** only when the live mode is off and `ZAKBIS_SMS_TEST_CODE` is set, and only for `2519000000NN` numbers.
  - **Otherwise off:** the UI says "Phone check opens soon".
- **The receiver never sees the cut.** The traveler sees "you get N ETB" wherever they name, counter or accept a price, and on the order.
- **Notes** go through `notify()` for every step: the Inbox, and Telegram through the existing outbox.
- **Migration** applied by the user inside `begin;`/`commit;`. No new enum values (state lives in columns), so the transaction is safe.
- **Copy rules:** minimal hints, no free text that could carry contact details, and the existing `btn` and button styles.
- **Commands:** after code changes, run `graphify update .`. Never commit `.claude/`, `CLAUDE.md`, `skills-lock.json`, `graphify-out/`, `.env*` or `next-env.d.ts`.
- **Tests:** `sh supabase/tests/run.sh`, `node --test lib/*.test.ts`, `npm run lint`, `npm run build`.

## Review Focus
1. **Two tabs or a deadline racing an action**, such as the receiver tapping "Not right" as the 24 h silence passes, or the traveler entering the code as the no-show week ends. Exactly one outcome may win. Each action re-checks the status, the hold and the deadline under the row lock. Tested in Task 2 and Task 4.
2. **The phone reveal through direct calls.** `counterpart_phone` must return null before `landed_at`, and null for a receiver who hasn't confirmed their own number. `mark_in_addis` must not be callable by `authenticated`. Tested in Task 3.
3. **Refund and payout double-spend:** an order is either refund-decided or delivered or paid out, never two of these. `mark_paid_out` and `mark_order_refunded` must each run once. Tested in Task 4.
4. **A held order that the deadlines touch anyway**, so no clock runs while an admin is deciding. Tested in Task 5.
5. **The SMS route's abuse paths:** sending to a non-Ethiopian number, the rate limit, brute-forcing the code past 5 tries, test mode leaking into live, and a number that already belongs to another account. Tested in Task 3 with node tests on the pure helpers and a route-level guard order.

---

### Task 1: The 15% cut and the traveler's take-home

**Files:**
- Create: `supabase/migrations/0011_after_paid.sql` (first section)
- Modify: `lib/money.ts`, `lib/money.test.ts`
- Modify: `supabase/tests/trip_flow_test.sql:83`, `supabase/tests/open_flow_test.sql:80`
- Modify: `app/orders/requests/[id]/order-detail.tsx` (traveler's first price form), `app/requests/[id]/make-offer.tsx`, `components/orders/offer-card.tsx` (counter form and Accept-suggestion label)
- Test: `supabase/tests/after_paid_test.sql` (new), `lib/money.test.ts`

**Interfaces:**
- Produces:
  - `settings` table: a single row, `fee_pct int` (0–50), readable by anon and authenticated.
  - SQL `fee_pct() returns int`, granted to anon and authenticated.
  - `requests.fee_pct int not null default 15`.
  - `fee_etb` and `payout_etb` regenerated from `fee_pct`.
  - `settle_offer` sets `fee_pct = fee_pct()`.
  - TS `takeHome(reward: number, feePct: number): number`.
  - `quote({..., feePct})` returns `fee` and `payout` at that rate.

- [ ] **Step 1: Write the failing tests.**
  - In `lib/money.test.ts`, change the quote cases to pass `feePct: 15`:
    - reward 800 → `fee` 120;
    - the rounding case is reward 50 at 15%, which gives 7.5, so `fee` 8.
  - Add `takeHome(1200, 15) === 1020` and `takeHome(50, 15) === 42`.
  - In `trip_flow_test.sql:83`, expect `(4620, 120, 5420, 5300)`. In `open_flow_test.sql:80`, expect fee `90`.
  - New `after_paid_test.sql` (load helpers the way `negotiation_test.sql` does):
    - `fee_pct()` = 15;
    - after `update settings set fee_pct = 20`, a newly settled offer gets `fee_pct` 20 while an earlier order keeps 15;
    - `insert into requests (... fee_pct) values (... 1)` as a receiver still yields the current rate. This needs `requests_before_insert` to set `new.fee_pct := fee_pct()`, the same way it forces the other columns.
- [ ] **Step 2: Run them and watch them fail.** `node --test lib/money.test.ts` fails on fee 72 ≠ 120. `sh supabase/tests/run.sh` fails in `trip_flow_test` and `after_paid_test`.
- [ ] **Step 3: Implement.**
  - Migration section "Cut":
    - create the `settings` table with one row (15), then `fee_pct()`;
    - `alter table requests add column fee_pct ... default 15`;
    - drop `payout_etb` and `fee_etb`, then re-add them generated with `fee_pct` in place of 9. The formula is otherwise the same as `0001_buy_me.sql:91-93`.
    - `create or replace` `settle_offer`, a copy of `0009_negotiation.sql:293`, adding `fee_pct = fee_pct()` to its `update requests`;
    - `create or replace` `requests_before_insert`, a copy of 0009's, adding `new.fee_pct := fee_pct();`.
  - `lib/money.ts`: give `quote` a `feePct` parameter and add `takeHome`. Update the doc comment to say 15% stored in `settings`.
  - UI:
    - load the rate once per screen with `supabase.rpc("fee_pct")`;
    - under each traveler price input, show `You get {etb(takeHome(n, pct))}` once the input parses;
    - the Accept-suggestion button for the traveler reads `Accept {etb(s)} · you get {etb(takeHome(s, pct))}`;
    - receivers see nothing new.
- [ ] **Step 4: Run.** `node --test lib/*.test.ts`, `sh supabase/tests/run.sh` and `npm run lint` all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat: 15% cut stored in settings, traveler take-home"`

### Task 2: Bought, photo check, swap

**Files:**
- Modify: `supabase/migrations/0011_after_paid.sql` (section "Bought")
- Test: `supabase/tests/after_paid_test.sql`, plus the existing tests that use `advance_request(..., 'purchased'|'landed')` or `deliver(` (`hardening_test`, `verification_test`, `trip_flow_test`, `open_flow_test`, `storage_test`). Move them onto the new functions.

**Interfaces:**
- Produces, as new columns on `requests`:
  - `item_photo_path text`;
  - `photo_status text check in ('pending','ok','rejected')`;
  - `photo_reason text` (the reason list);
  - `photo_due_at timestamptz`;
  - `buy_due_at timestamptz` (null means the end of the shop-by day);
  - `hold text` (the hold kinds) and `held_at timestamptz`;
  - `refund_decided_at timestamptz`;
  - `handover_due_at timestamptz`;
  - `delivered_by_timeout boolean not null default false`;
  - `buy_reminded`, `arrival_reminded` (boolean, default false) and `handover_reminders int default 0`.
- SQL functions:
  - `buy_due(r requests) returns timestamptz` (internal);
  - `item_reason_label(text) returns text`;
  - `mark_bought(p_request uuid, p_receipt text, p_photo text)`;
  - `check_item(p_request uuid, p_ok boolean, p_reason text default null)`;
  - `swap_item(p_request uuid, p_receipt text, p_photo text)`;
  - `cant_swap(p_request uuid)`;
  - `decide_refund(r requests, p_receiver_note text, p_traveler_note text)` (internal), which sets status `cancelled`, `refund_decided_at = now()` and `hold = null`, and writes both notes;
  - `can_see_proof` replaced to include `item_photo_path`;
  - `advance_request` replaced so that `purchased`, `landed` and `paid_out` raise "use mark_bought, the In Addis step or mark_paid_out".

- [ ] **Step 1: Write the failing tests** in `after_paid_test.sql`, with a paid order set up through the real functions, `submit_payment` then `decide_payment`, as `payment_test.sql` does:
  - **Bought:** `mark_bought` by the traveler with two files in `proofs/<uid>/` → status `purchased`, `photo_status` `pending`, `photo_due_at <= now() + 24h`, and a note to the receiver.
  - **Refusals:** `mark_bought` by the receiver raises "only the traveler"; with a file outside the caller's folder or missing from storage it raises "upload"; after `buy_due` it raises "time is up".
  - **Photo checked:** `check_item(ok)` → `ok`. `check_item(false, 'wrong_color')` → `rejected`, with the reason stored and a note "Wrong color" to the traveler. `check_item(false, 'blue please')` raises "choose a reason". `check_item` after `photo_due_at` raises "time is up".
  - **Swap:** `swap_item` while rejected → `pending` with new paths and a new `photo_due_at`. `swap_item` while `ok` raises "no longer valid".
  - **Can't swap:** `cant_swap` → `cancelled` with `refund_decided_at` set, and the trip lock released (`update trips set status='cancelled'` now succeeds).
  - **Old path:** `advance_request(id, 'purchased')` raises "use mark_bought".
  - **Who sees the photo:** `can_see_proof(item_photo_path)` is true for both parties and false for a stranger.
- [ ] **Step 2: Run and watch them fail.** `sh supabase/tests/run.sh` reports that `mark_bought` doesn't exist.
- [ ] **Step 3: Implement the "Bought" section.**
  - Notes, using `traveler_name` and `receiver_name`:
    - receiver after Bought: `%s bought %s. Check the photo within %s h.`, where the hours come from `hours_left(photo_due_at)`;
    - traveler after OK: `%s says %s looks right.`;
    - traveler after "Not right": `%s says %s isn't right: %s. Swap it by the end of %s, or tell us you can't.`, with the shop-by date as `to_char(…, 'FMDD Mon')`;
    - receiver after a swap: `%s swapped %s. Check the new photo within %s h.`;
    - receiver on can't swap: `%s can't swap %s, so the order is cancelled. We'll refund you %s.`, with the amount as `etb_text(total_etb)`;
    - traveler on can't swap: `The order for %s is cancelled. Return the item to the shop if you can.`.
  - Move the existing tests onto the new functions. Use a `landed` setup through `mark_in_addis` from Task 3 only once that exists. Until then, set `landed_at` and `status` directly as superuser, with `request.jwt.claim.sub` cleared as the existing tests do, and record that ruling.
- [ ] **Step 4: Run.** `sh supabase/tests/run.sh` passes for all files.
- [ ] **Step 5: Commit.** `git commit -m "feat: bought with receipt and item photo, receiver check, swap"`

### Task 3: Phone codes, "I'm in Addis", the reveal

**Files:**
- Modify: `supabase/migrations/0011_after_paid.sql` (section "Phone")
- Create: `lib/phone.ts`, `lib/phone.test.ts`, `lib/sms.ts`, `lib/sms.test.ts`
- Create: `app/api/phone/route.ts` (GET availability), `app/api/phone/send/route.ts`, `app/api/phone/verify/route.ts`
- Test: `supabase/tests/after_paid_test.sql`, `lib/phone.test.ts`, `lib/sms.test.ts`

**Interfaces:**
- Produces:
  - **The `phone_codes` table:** `id`, `user_id`, `phone`, `code_hash`, `request_id` (nullable), `expires_at`, `attempts int default 0`, `used_at`, `created_at`. RLS is on with no policies, so only the service role can reach it.
  - **SQL `mark_in_addis(p_request uuid, p_user uuid)`:** executable by `service_role` only, revoked from public, anon and authenticated. It checks:
    - `p_user` is the traveler;
    - the status is `purchased`, `photo_status` is `ok` and there's no hold;
    - `addis_today() >= trip.arrival_date`;
    - `phone_of(p_user) like '251%'`.
    
    It sets `landed_at`, status `landed` and `handover_due_at = now() + 7 days`, and writes the notes.
  - **`counterpart_phone` replaced:** returns the other side's phone only when `landed_at is not null`. A receiver caller also needs `phone_of(auth.uid()) is not null`.
  - **`lib/phone.ts`:** `normalizeEtPhone(raw: string): string | null`, which accepts `09…`, `07…`, `9…`, `7…`, `+2519…`, `2517…` with spaces or dashes, and returns `2519XXXXXXXX` or null. Also `displayPhone(p: string): string`, which gives `+251 9XX XXX XXX`.
  - **`lib/sms.ts`:**
    - `smsMode(env): "live" | "test" | "off"`;
    - `isTestNumber(p: string): boolean`, matching `/^2519000000\d\d$/`;
    - `hashCode(code: string, uid: string): string`;
    - `sendSms(env, to: string, text: string): Promise<boolean>`, which in live mode calls `https://api.afromessage.com/api/send` with `Authorization: Bearer <token>` and the `from`, `sender`, `to` and `message` query parameters.
  - **API routes:**
    - `GET /api/phone` → `{ available: boolean }`, true when live, or in test mode;
    - `POST /api/phone/send {phone, requestId?}` → `200 {}` or `{error}`;
    - `POST /api/phone/verify {code, requestId?}` → `200 {}` or `{error}`.
    
    The error codes are: `invalid_phone`, `sms_off`, `too_soon`, `too_many`, `wrong_code`, `expired`, `locked`, `phone_in_use`, `not_allowed`.

- [ ] **Step 1: Write the failing tests.**
  - **`lib/phone.test.ts`:**
    - `"0911 23 45 67"`, `"+251911234567"` and `"911234567"` all → `"251911234567"`;
    - `"0711234567"` → `"251711234567"`;
    - `"0111234567"` (landline), `"+447700900123"` and `"09112345"` → null;
    - `displayPhone("251911234567") === "+251 911 234 567"`.
  - **`lib/sms.test.ts`:**
    - `smsMode` with all three AfroMessage vars → `live`, even if `ZAKBIS_SMS_TEST_CODE` is set;
    - only the test code → `test`; nothing → `off`; token only → `off`;
    - `isTestNumber("251900000012")` is true, `isTestNumber("251911234567")` is false;
    - `hashCode` is deterministic and differs per user.
  - **`after_paid_test.sql`:**
    - as `authenticated`, `select mark_in_addis(...)` raises a permission error;
    - as superuser with `p_user` set to the traveler, it raises "arrival" before the arrival date. Set the trip's `arrival_date` to today via superuser for the success case;
    - it raises "phone" when `auth.users.phone` is null;
    - success → `landed` with `handover_due_at` about 7 days out;
    - `counterpart_phone` as the receiver is null until the receiver has a confirmed phone, then the traveler's;
    - as the traveler it returns the receiver's confirmed phone after landing, and null before;
    - receiver notes: with a confirmed receiver phone the body contains `Call her on +251` (`displayPhone` format, built in SQL as `'+251 ' || substr…`); without one, the body says `Confirm your phone number`.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
  - **Migration section "Phone":**
    - create the `phone_codes` table;
    - create `mark_in_addis`, with these notes:
      - receiver, number confirmed: `%s is in Addis. Call %s on %s. Pick a public place to meet for safety.`;
      - receiver, not confirmed: `%s is in Addis. Confirm your phone number to see their number and meet.`;
      - traveler: `You're marked in Addis. %s's number is on the order.`, or `… %s hasn't confirmed their number yet; we've asked them.`;
    - replace `counterpart_phone`.
  - **Routes:** use `createClient()` from `@/lib/supabase/server` for the session user and `createAdminClient()` for `phone_codes` and Auth. `send` validates in this order:
    1. signed in;
    2. `normalizeEtPhone`;
    3. `smsMode !== "off"`;
    4. in test mode, `isTestNumber`;
    5. the rate limits, from `phone_codes` rows for the user;
    6. insert the hash, then send. In test mode the code is `ZAKBIS_SMS_TEST_CODE` and nothing is sent.
    
    The SMS text is `Your Zakbis code is NNNNNN`. `verify` takes the newest unused, unexpired row for the user (and request): too many attempts → `locked`, and a mismatch increments `attempts` → `wrong_code`. On a match it:
    1. sets `used_at`;
    2. calls `admin.auth.admin.updateUserById(uid, { phone, phone_confirm: true })`. A duplicate-phone error → `phone_in_use`;
    3. if `requestId` was given, calls `admin.rpc("mark_in_addis", { p_request, p_user: uid })`. A database error → `not_allowed`.
  - Never log codes, tokens or phone numbers.
- [ ] **Step 4: Run.** `node --test lib/*.test.ts`, `sh supabase/tests/run.sh` and `npm run lint` all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat: SMS phone codes, I'm in Addis, phone reveal"`

### Task 4: Handover, problems, holds, refunds, payouts

**Files:**
- Modify: `supabase/migrations/0011_after_paid.sql` (section "Handover and admin")
- Test: `supabase/tests/after_paid_test.sql`

**Interfaces:**
- Produces:
  - `deliver(p_id, p_code)` replaced: the same contract (returns `delivered`, `wrong_code` or `locked`), but it also requires `hold is null`, and on success it notes both sides;
  - `report_problem(p_request uuid, p_kind text)`: receiver only, status `landed`, kind `item_problem` or `cant_reach`, no hold yet. It sets `hold` and `held_at`;
  - `resolve_hold(p_request uuid, p_action text)`: admin, using the action matrix in Global Constraints;
  - `mark_order_refunded(p_request uuid)`: admin, needs status `cancelled`, `refund_decided_at` set and a `confirmed` escrow payment. It sets that payment to `refunded` and notes the receiver;
  - `mark_paid_out(p_request uuid)`: admin, needs status `delivered` and a traveler `payout_accounts` row. It sets `paid_out` and notes the traveler;
  - `orders_to_act()`: admin only. It returns `(request_id, item_name, quantity, kind text, hold text, held_at, amount_etb int, receiver_name, traveler_name, payout_method, payout_account_name, payout_account_number, payout_bank_name, refund_method text, delivered_by_timeout boolean)`, where `kind` is `hold`, `refund` or `payout`:
    - `refund`: cancelled with a refund decided and the payment not yet refunded; the amount is `total_etb`;
    - `payout`: delivered; the amount is `payout_etb`.

- [ ] **Step 1: Write the failing tests:**
  - **Delivering:** `deliver` with the right code → `delivered` and notes. With a hold set it raises "on hold".
  - **Reporting:** `report_problem('cant_reach')` by the traveler raises "only the receiver". Before landing it raises "no longer valid".
  - **Resolving:**
    - `resolve_hold('restart')` on `cant_reach` → `hold` null, `handover_due_at` about now + 7 d, `handover_reminders` 0;
    - `resolve_hold('pay')` on `item_problem` → `delivered`;
    - `resolve_hold('extend')` on `item_problem` raises "not an option";
    - `resolve_hold('refund')` → `cancelled` with `refund_decided_at`;
    - a non-admin raises "admins only".
  - **Refunding:** `mark_order_refunded` → payment `refunded`. A second call raises. It raises on a delivered order.
  - **Paying out:** `mark_paid_out` → `paid_out`. A second call raises. It raises with no payout account. It raises on a refund-decided order.
  - **The queue:** `orders_to_act()` lists one row of each kind with the right amounts: payout is item plus 85% of the reward, refund is `total_etb`.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.** Notes:
  - delivered, traveler: `%s confirmed the handover. We'll send you %s.`, using `payout_etb`;
  - delivered, receiver: `You got %s. Thanks for using Zakbis!`;
  - problem reported, traveler: `%s reported a problem with %s. Zakbis will contact you.`;
  - refund decided: reuse `decide_refund`;
  - paid out: `We sent you %s for %s.`;
  - refunded: `We refunded %s for %s.`.
- [ ] **Step 4: Run.** `sh supabase/tests/run.sh` passes.
- [ ] **Step 5: Commit.** `git commit -m "feat: handover, problems, admin holds, refunds and payouts"`

### Task 5: Deadlines and reminders

**Files:**
- Modify: `supabase/migrations/0011_after_paid.sql` (section "Deadlines": `create or replace run_deadlines()`, a copy of steps 1–7 from `0010_payments_deadlines.sql:153-221` plus the steps below)
- Test: `supabase/tests/deadlines_test.sql`, adding to it in its existing style

**Interfaces:**
- Consumes: the columns from Task 2, `decide_refund`, and `phone_of`.
- Produces: `run_deadlines()` steps 8–14, all skipping held orders:
  - **8.** photo silence: `pending` and `photo_due_at < now()` → `ok`. Note to the traveler: `%s didn't answer in time, so the photo of %s counts as right.`;
  - **9.** not bought: `paid` and `buy_due(r) < now()` → `hold 'not_bought'`. Notes to the receiver (`%s hasn't marked %s bought yet. Zakbis is looking into it.`) and the traveler;
  - **10.** swap missed: `purchased`, `rejected` and `buy_due(r) < now()` → `decide_refund`;
  - **11.** traveler no-show: `purchased`, `addis_today() > trip.arrival_date + 7` → `decide_refund`;
  - **12.** receiver no-show: `landed` and `handover_due_at < now()`. If `phone_of(receiver)` is set → `delivered` with `delivered_by_timeout = true` and notes; otherwise `hold 'no_receiver_phone'`;
  - **13.** reminders:
    - `paid` and `addis_today() = shop_by` and not `buy_reminded` → traveler: `Today is the last day to buy %s.`;
    - `purchased` and `addis_today() >= arrival_date` and not `arrival_reminded` → receiver: `%s is due in Addis today.`;
  - **14.** handover reminders: `landed`, with `handover_reminders < 1` and `now() > landed_at + 3 d`, or `< 2` and `> landed_at + 6 d` → receiver: `%s is waiting to hand over %s. Call them on %s.` when confirmed, or `Confirm your phone number to meet %s.` otherwise.

- [ ] **Step 1: Write the failing tests:** one test per step 8–14, moving clocks by updating the due columns or dates as superuser, plus:
  - a held order is untouched by steps 8–12 and 14;
  - running `run_deadlines()` twice writes reminders once;
  - **race check:** an order whose `photo_due_at` has passed but which `check_item(false, …)` locked first stays `rejected`. Call `check_item` before `run_deadlines` and assert that step 8 skips it, because `photo_status` is no longer `pending`.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `sh supabase/tests/run.sh` passes.
- [ ] **Step 5: Commit.** `git commit -m "feat: after-paid deadlines and reminders"`

### Task 6: Order screens after payment

**Files:**
- Create: `components/orders/after-paid.tsx`, `components/orders/phone-check.tsx`, `components/orders/upload-proof.ts`, which holds the shared proofs upload taken out of `payment-section.tsx:45-56`. `PaymentSection` then uses it.
- Modify: `app/orders/requests/[id]/order-detail.tsx`: extend the `Request` type with the Task 2 columns plus `fee_pct`, `payout_etb`, `landed_at`, `purchased_at`, `receipt_path`; render `AfterPaid` when the status is `paid`, `purchased`, `landed`, `delivered` or `paid_out`, or `cancelled` with `refund_decided_at`; extend `friendly()` with "on hold" and "choose a reason".
- Modify: `lib/negotiation.ts` and `lib/negotiation.test.ts` (new stages), and the `my_orders` replacement in the migration.

**Interfaces:**
- Consumes: Tasks 2–4 functions and the `/api/phone/*` routes.
- Produces:
  - `AfterPaid({ req, viewer, names, receiverName, now, busy, act, reload })`;
  - `PhoneCheck({ requestId?: string, title: string, onDone: () => Promise<void> })`;
  - `uploadProof(file: File): Promise<{ path: string } | { error: string }>`;
  - `Stage` gains `buy`, `check_item`, `swap`, `bought`, `in_addis`, `on_hold`, `delivered`, `paid_out` and `refunding`.

- [ ] **Step 1: Write the failing tests.** In `lib/negotiation.test.ts`, check each new `stageLabel`:
  - `buy` → "Buy it", or `Buy within N h` when `dueAt` is set;
  - `check_item` → "Check the photo";
  - `swap` → "Swap needed";
  - `bought` → "Bought";
  - `in_addis` → "In Addis";
  - `on_hold` → "Zakbis is checking";
  - `delivered` → "Delivered";
  - `paid_out` → "Paid out";
  - `refunding` → "Refund on its way".
  
  `needsYou` in `order-list.tsx` also gains `buy`, `check_item` and `swap`.
- [ ] **Step 2: Run and watch them fail.** `node --test lib/negotiation.test.ts`.
- [ ] **Step 3: Implement.**
  - **`my_orders` replaced** (a copy of `0009_negotiation.sql`'s), mapping the `paid` to `paid_out` statuses and `refund_decided_at` onto the new stages from each side, with `due_at` from `buy_due`, `photo_due_at` or `handover_due_at`.
  - **`AfterPaid`, per stage and side:**
    - **Traveler, paid:** a "Mark bought" form with two `uploadProof` pickers (Receipt, Item photo) and `mark_bought`, plus "Buy by {date}".
    - **Receiver, paid:** "{Traveler} is shopping", plus a `PhoneCheck` card ("Confirm your number for the handover") if `my_phone_confirmed` is false.
    - **Both, purchased:** the receipt and item photo, as signed URLs from `proofs`, with a 1 h expiry.
    - **Receiver, photo pending:** "Looks right" and "Not right", which opens a reason picker over the item reasons. Reuse `ReasonPicker` by giving it an optional `reasons` prop.
    - **Traveler, rejected:** the reason, "Upload swap" (the same two pickers, then `swap_item`) and "Can't swap" (confirm, then `cant_swap`).
    - **Traveler, photo ok:** an "I'm in Addis" card, disabled before the arrival date with "From {arrival date}". It opens `PhoneCheck` with `requestId`. In the copy: "No Ethiopian SIM? Buy one at Bole arrivals with your passport."
    - **Landed, receiver:**
      - the traveler's number as a `tel:` link from `counterpart_phone`, or `PhoneCheck` if they haven't confirmed theirs;
      - the handover code, large, from `handover_codes`, with "Give this code to {traveler} only once you have the item";
      - "Report a problem", which opens two choices (`item_problem`, "Problem with the item", and `cant_reach`, "I can't reach the traveler") and calls `report_problem`.
    - **Landed, traveler:**
      - the receiver's number as a `tel:` link, or "{receiver} hasn't confirmed their number yet";
      - a 6-digit code input calling `deliver`: `wrong_code` → "That code isn't right", `locked` → "Too many tries. Zakbis will contact you.";
      - "Add a payout account first" with a link to `/profile/payout` when the database says so.
    - **Delivered:** traveler "We'll send you {payout}", receiver "Delivered".
    - **Paid out:** "Paid out {payout}".
    - **Refund decided:** receiver "Refund on its way" until the payment is refunded, then "Cancelled, refunded"; traveler "Cancelled".
    - **Hold:** both see "Zakbis is checking this order".
  - **`PhoneCheck`:**
    - `GET /api/phone` first; if it's not available → "Phone check opens soon";
    - otherwise a number input ("Ethiopian phone number"), "Send code", then a code input with `inputMode="numeric"` and `autoComplete="one-time-code"`, and "Confirm";
    - map each error code to one short line;
    - on success, call `onDone`, which reloads.
- [ ] **Step 4: Run.** `node --test lib/*.test.ts`, `npm run lint` and `npm run build` all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat: order screens from paid to paid out"`

### Task 7: Admin Orders page

**Files:**
- Create: `app/admin/orders/page.tsx`, `app/admin/orders/order-queue.tsx`, following the pattern of `app/admin/payments/page.tsx` and `payment-queue.tsx`
- Modify: the links between admin pages in `app/admin/payments/page.tsx`, `app/admin/trips/page.tsx` and `app/admin/verifications/page.tsx`

**Interfaces:**
- Consumes: `orders_to_act()`, `resolve_hold`, `mark_order_refunded` and `mark_paid_out`.

- [ ] **Step 1: Check the empty and admin-only paths:**
  - a non-admin gets "Admins only", the same guard as the payments page;
  - the empty state is "Nothing to act on".
- [ ] **Step 2: Implement three sections:**
  - **"On hold":** item, people, hold label and waiting time, with the two allowed action buttons per hold kind. Labels: "Refund the receiver", "Give 2 more days", "Restart the week", "Pay the traveler". Each one asks for confirmation inline first.
  - **"Refunds to send":** amount, receiver, method, then "Mark refunded".
  - **"Payouts to send":** amount, the traveler's payout method, account name, number and bank, with Copy buttons as in `PaymentSection`, then "Mark paid out". Show "(receiver didn't show)" when `delivered_by_timeout`.
  
  Reload after every action, as `payment-queue.tsx` does.
- [ ] **Step 3: Run.** `npm run lint` and `npm run build` pass.
- [ ] **Step 4: Commit.** `git commit -m "feat: admin orders page for holds, refunds and payouts"`

### Task 8: Final checks

- [ ] **Step 1: Run the full suite.** `sh supabase/tests/run.sh`, `node --test lib/*.test.ts`, `npm run lint`, `npm run build` and `graphify update .`.
- [ ] **Step 2: Update `PRODUCT.md`.** Its fee line goes from 9% to 15%, and its phone line to "confirmed by SMS at 'I'm in Addis' (traveler) and before the handover (receiver)".
- [ ] **Step 3: Commit.** `git commit -m "docs: after-paid product notes"`
- [ ] **Step 4: Hand the user their steps:**
  1. apply `0011_after_paid.sql` in `begin;`/`commit;`;
  2. add `ZAKBIS_SMS_TEST_CODE` locally only, for the walk-through;
  3. once AfroMessage can send, add `AFROMESSAGE_IDENTIFIER` and `AFROMESSAGE_SENDER` in Vercel (`AFROMESSAGE_TOKEN` already exists).
  
  The browser walk-through follows once the migration is applied.
