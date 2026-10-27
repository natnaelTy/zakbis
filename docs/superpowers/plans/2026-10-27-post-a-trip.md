# Post a Trip (admin-checked) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** verified travelers post a trip with a ticket or crew roster. An admin approves or rejects every trip, and only approved trips are visible to others. The plan also brings in the new five-tab bar, with the traveler's trips under Orders.

**Architecture:**
- **One migration (0008)** adds trip status, proof and decision columns, a private `tickets` bucket, a guarding trigger, and the admin function `decide_trip`.
- **Owner and admin reads of private columns** go through security-definer RPCs, the same pattern as `my_photo_path`.
- **The client** gets pure helpers in `lib/trip-post.ts` with unit tests, one reusable `TripForm`, and new pages `/orders`, `/orders/trips/[id]`, `/inbox` and `/admin/trips`.

**Tech Stack:** Next.js 16.2 App Router, React 19, Tailwind, shadcn base-nova, lucide-react, Supabase (Postgres RLS, Storage).
- Tests: `sh supabase/tests/run.sh`, `node --test lib/*.test.ts`, `npm run lint` (typegen + tsc), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-27-post-a-trip-design.md`

## Global Constraints

- **Look and feel:** follow `DESIGN.md`. 16px body; touch targets at least 44px; pages inside `AppShell` with `md:max-w-xl`.
- **Tab labels, exact, both sides:** "Explore", "Orders", "Post", "Inbox", "Profile".
- **Exact copy:**
  - **Trip status pills:** "Checking ticket", "Live", "Fix needed", "Cancelled".
  - **Proof choice:** "Ticket" and "Crew roster".
  - **Customs tick:** "I'll only carry items allowed by my airline and Ethiopian customs and declare what's required". Crew tick: "My airline allows me to carry items for others".
  - **After submit:** "We're checking your ticket. Your trip will show on Explore once it's approved."
  - **Empty states:** "No orders yet", "No updates yet".
  - **Post gate:** "We're still checking your documents." (pending); "Your passport has expired." plus "Renew verification" (expired).
  - **Detail page actions:** "Change date", "Cancel trip", "Fix and resubmit", "Edit kg and note".
- **Proof uploads:** PDF, JPEG, PNG or WebP, up to 10 MB (10485760 bytes). Images must decode with `createImageBitmap`. Path is `<uid>/<uuid>.<ext>` in bucket `tickets`.
- **Origin countries:** the existing `country_code` enum (US, GB, CN, AE). The airport is exactly 3 letters A–Z, stored uppercase.
- **Never** select private trip columns (`proof_kind`, `proof_path`, `rejection_reason`, `decided_at`, `decided_by`, `customs_agreed_at`) from `trips` directly in the client. Use `my_trips()` and `trips_to_check()`.
- **Explore keeps its sample data** in this piece.
- **Commits** only when the user says so. Never commit `.claude/`, `CLAUDE.md`, `skills-lock.json`, `graphify-out/`, `.env` or `next-env.d.ts`.
- **Migration 0008 is not applied to live** by the builder. The user applies it after checking that live `trips` has no real rows.

## Review Focus

1. **A traveler whose verification is approved but whose passport expires before the landing date** submits a trip → it is refused with "your passport must be valid until you land". → Task 1 SQL test.
2. **A traveler changes only free kg on a live trip** → it stays live. **They change only `shop_by`** → it goes back to checking and disappears for others. → Task 1 SQL test.
3. **A traveler tries `update trips set status = 'live'`**, or tries to un-cancel a cancelled trip → it is refused, or the status is forced back. → Task 1 SQL test.
4. **A receiver, or anon, reads a trip's `proof_path`**, or downloads a file from `tickets` → denied. → Task 1 SQL test.
5. **A PDF renamed to `.jpg`, or an 11 MB file** → the form shows "Please choose a PDF, JPG, PNG or WebP under 10 MB" before uploading. → Task 3 unit test (`proofError`).

---

### Task 1: Database (migration 0008) and SQL tests

**Files:**
- Create: `supabase/migrations/0008_post_a_trip.sql`, `supabase/tests/post_trip_test.sql`
- Modify: the trip inserts in `supabase/tests/{hardening,open_flow,reviews,verification,storage,trip_flow}_test.sql`. Add `status` with `'live'` to each existing trip insert, because those trips stand for already-approved trips.

**Interfaces (produces):**
- `create type trip_status as enum ('checking', 'live', 'needs_fix', 'cancelled')`. `create type proof_kind as enum ('ticket', 'roster')`.
- **`trips` gains:**
  - `status trip_status not null default 'checking'`;
  - `proof_kind proof_kind not null default 'ticket'`;
  - `proof_path text`;
  - `rejection_reason text`;
  - `decided_at timestamptz`;
  - `decided_by uuid references profiles`;
  - `customs_agreed_at timestamptz`.
- **Column grants on `trips`:**
  - `revoke all ... from anon, authenticated`;
  - `grant select (id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, note, created_at, status)` to anon and authenticated;
  - `grant insert (origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg, note, proof_kind, proof_path, customs_agreed_at)` to authenticated;
  - `grant update` on the same columns plus `status` to authenticated.
- **Policies:**
  - drop `"own trips"`;
  - add `"own trip insert"` (insert, `with check (traveler_id = auth.uid())`) and `"own trip update"` (update, `using`/`with check traveler_id = auth.uid()`). There's no delete policy;
  - recreate `"listed trips"`: the first clause becomes `status = 'live' and shop_by >= addis_today() and is_verified_traveler(traveler_id)`, and the other clauses are unchanged.
- **Trigger `trips_guard()`,** before insert or update, `security definer`. Follow the `traveler_verifications_submit` pattern:
  - **When it lets the write through untouched:** when `zakbis.deciding = 'on'` and (`is_admin()` or `auth.uid() is null`), and also whenever `auth.uid() is null` (server-side code and tests).
  - **On insert:**
    - `new.traveler_id := auth.uid()`;
    - require `is_verified_traveler(auth.uid())`, else `'verify before posting a trip'`;
    - require the approved verification's `passport_expiry >= new.arrival_date`, else `'your passport must be valid until you land'`;
    - require `proof_path` whose first folder is the uid, else `'upload your ticket'`;
    - require `customs_agreed_at is not null`, else `'agree to the customs rules'`, then set it to `now()`;
    - set `status := 'checking'` and clear the decision fields.
  - **On update:**
    - `old.status = 'cancelled'` → `'cancelled trips are final'`;
    - keep `traveler_id`, `decided_*` and `rejection_reason` from `old`;
    - if `new.status = 'cancelled'`, set `new := old` with status cancelled and return;
    - if any of `origin_country`, `origin_city`, `origin_airport`, `shop_by`, `arrival_date`, `proof_kind` or `proof_path` changed, or `old.status = 'needs_fix'`: re-run the insert checks (verification, expiry against the new arrival date, proof folder), then set `status := 'checking'` and clear the decision fields and the reason;
    - otherwise set `new.status := old.status`.
- **`decide_trip(p_trip uuid, p_approve boolean, p_reason text default null) returns void`**, security definer:
  - only admins (`'admins only'`);
  - rejecting needs a reason (`'a reason is required to reject'`);
  - only a trip in `checking` can be decided (`'this trip is not waiting for a check'`);
  - sets `zakbis.deciding`, then status `live` or `needs_fix`, the reason, `decided_at` and `decided_by`.
- **`my_trips() returns setof trips`**, security definer: rows where `traveler_id = auth.uid()`, ordered by `arrival_date desc`.
- **`trips_to_check()`** returns a table with `trips.*` columns plus `legal_name text, given_name text`. Security definer, admins only (`'admins only'`). It returns `status = 'checking'` trips joined with `traveler_verifications`, oldest `created_at` first.
- **Live trips only:**
  - `requests_before_insert`: the trip lookup adds `and status = 'live'`;
  - `make_offer`: the trip lookup adds `and status = 'live'`, keeping the error `'trip not found'`;
  - `accept_offer`: the re-check adds `t.status = 'live'`.
  - Recreate each from its latest definition (0005 for `requests_before_insert`, 0003 for the other two) with only that change.
- **Storage:**
  - insert bucket `tickets`: private, `10485760` bytes, mime types `application/pdf`, `image/jpeg`, `image/png` and `image/webp`;
  - policy `"tickets upload"` (insert, own folder) and `"tickets read"` (select, own folder or `is_admin()`);
  - recreate `"manage own files"` excluding `'tickets'` as well (`bucket_id not in ('proofs', 'identity', 'tickets')`).

- [ ] **Step 1: Write `supabase/tests/post_trip_test.sql`.** It runs in a transaction that rolls back, with the `must_fail` helper copied from `sides_test.sql`. Set up an admin, receiver R, a verified traveler T (`test_verify`) and an unverified traveler U. Then, under `set local role authenticated` with the jwt sub set:
  - U inserting a trip fails with `'verify before posting a trip'`;
  - T inserting with no `proof_path` fails with `'upload your ticket'`;
  - T inserting a `proof_path` in another user's folder fails;
  - T inserting with no `customs_agreed_at` fails;
  - T inserting with an `arrival_date` after the passport expiry (`addis_today() + 400`) fails with `'your passport must be valid until you land'`;
  - T inserting a valid trip with `status = 'live'` in the insert: the row is stored as `'checking'`;
  - as R: the checking trip isn't visible (count 0), and anon also sees 0;
  - as R: `select proof_path from trips` fails (no column privilege);
  - as T: `update trips set status = 'live'` leaves the status `'checking'`;
  - as T: `decide_trip` fails with `'admins only'`;
  - as admin: `decide_trip(id, false)` with no reason fails; `decide_trip(id, false, 'Name differs')` gives `needs_fix`; `trips_to_check()` returns 0 rows; T's update of `note` puts it back to `checking`; `trips_to_check()` returns 1 row with `legal_name = 'TEST TRAVELER'`; `decide_trip(id, true)` gives `live`;
  - as R: the live trip is visible (count 1);
  - as T: updating `free_kg` keeps `live`; updating `shop_by` gives `checking`; after the admin approves again, updating to `status = 'cancelled'` gives `cancelled`; then `update ... set status = 'checking'` fails with `'cancelled trips are final'`;
  - as T: `delete from trips` removes 0 rows;
  - as R: a trip request on a checking trip fails with `'trip is not available'`;
  - as T: `my_trips()` returns only T's rows;
  - as R: `select` from `storage.objects` where `bucket_id = 'tickets'` sees 0 of T's files. Insert the object row as T first, following `storage_test.sql`'s pattern.
- [ ] **Step 2:** Run `sh supabase/tests/run.sh`. Expected: `post_trip_test.sql` FAILs (column `proof_path` does not exist), and the others PASS.
- [ ] **Step 3:** Write `0008_post_a_trip.sql` as specified above, and add `status` with `'live'` to the existing tests' trip inserts.
- [ ] **Step 4:** Run `sh supabase/tests/run.sh`. Expected: every file PASSes.

### Task 2: Five-tab bar and placeholder pages

**Files:**
- Modify:
  - `lib/sides.ts`, `lib/sides.test.ts`;
  - `components/tab-bar.tsx` (icons, `grid-cols-5`);
  - the `active=` props in `app/page.tsx`, `app/trips/[id]/page.tsx` and `app/requests/page.tsx`. "Trips" and "Requests" become "Explore".
- Create: `app/orders/page.tsx` (placeholder for now, filled in Task 5), `app/inbox/page.tsx`.

**Interfaces (produces):**
- `type TabLabel = "Explore" | "Orders" | "Post" | "Inbox" | "Profile"`.
- `tabsFor(side)`, in this order:
  - **receiver:** `/`, `/orders`, `/post`, `/inbox`, `/profile`;
  - **traveler:** `/requests`, `/orders`, `/trips/new`, `/inbox`, `/profile`.
- `homeFor` is unchanged (first tab).
- **Icons:** Explore `Compass`, Orders `Package`, Post `Plus`, Inbox `Inbox`, Profile `User`.

- [ ] **Step 1: Update `lib/sides.test.ts`:**
  - receiver labels deep-equal `["Explore", "Orders", "Post", "Inbox", "Profile"]`;
  - traveler hrefs deep-equal `["/requests", "/orders", "/trips/new", "/inbox", "/profile"]`;
  - the home tests are unchanged.
- [ ] **Step 2:** Run `node --test lib/sides.test.ts`. Expected: FAIL on both tab tests.
- [ ] **Step 3:** Implement `sides.ts`, the tab bar and the `active` props. `/inbox` shows "Inbox" and "No updates yet" inside `AppShell active="Inbox"`. `/orders` shows "Orders" and "No orders yet".
- [ ] **Step 4:** Run `node --test lib/*.test.ts && npm run lint`. Expected: all pass, no type errors.

### Task 3: Pure trip helpers

**Files:** Create `lib/trip-post.ts`, `lib/trip-post.test.ts`.

**Interfaces (produces):**
- `type TripStatus = "checking" | "live" | "needs_fix" | "cancelled"`.
- `tripStatusLabel(s: TripStatus): { text: string; tone: "muted" | "good" | "bad" }`:
  - checking → "Checking ticket", muted;
  - live → "Live", good;
  - needs_fix → "Fix needed", bad;
  - cancelled → "Cancelled", muted.
- `type TripDraft = { origin_country: Country | ""; origin_city: string; origin_airport: string; arrival_date: string; shop_by: string; free_kg: string; note: string; customs: boolean; crew: boolean; proof_kind: "ticket" | "roster" }`, where `Country` comes from `lib/open-requests`.
- `tripErrors(d: TripDraft, today: string): Partial<Record<keyof TripDraft, string>>`:
  - origin_country: "Choose a country";
  - origin_city: "Enter the city" when empty;
  - origin_airport: "Enter the 3-letter airport code" unless it matches `/^[A-Za-z]{3}$/`;
  - arrival_date: "Choose your landing date", when empty or before `today`;
  - shop_by: "Shop-by must be on or before landing", when empty, before `today` or after `arrival_date`;
  - free_kg: "Enter free kg between 1 and 50", unless 1 ≤ n ≤ 50;
  - customs: "Tick to continue";
  - crew: "Tick to continue", only when `proof_kind === "roster"` and not ticked.
- `proofError(f: { type: string; size: number }): string | undefined`. Returns "Please choose a PDF, JPG, PNG or WebP under 10 MB" when the type isn't one of the four allowed mime types or the size is over 10485760. Image decoding is checked separately in the form.
- `postGate(state: VerificationState): "form" | "pending" | "verify" | "expired"`:
  - verified → form;
  - pending → pending;
  - expired → expired;
  - none and rejected → verify.

- [ ] **Step 1: Write `lib/trip-post.test.ts`.** One test per bullet above, using `today = "2026-10-27"`. Include:
  - a valid draft (`AE`, `Dubai`, `dxb`, landing `2026-11-12`, shop-by `2026-11-10`, kg `"5"`, customs ticked, ticket) → `{}`;
  - shop-by `2026-11-13` with landing `2026-11-12` → the shop_by error;
  - roster without crew ticked → the crew error;
  - `proofError({ type: "application/pdf", size: 10485761 })` → the message;
  - `proofError({ type: "image/webp", size: 1 })` → undefined;
  - `postGate("rejected") === "verify"`.
- [ ] **Step 2:** Run `node --test lib/trip-post.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `lib/trip-post.ts`.
- [ ] **Step 4:** Run `node --test lib/trip-post.test.ts`. Expected: PASS.

### Task 4: Posting a trip (`/trips/new`)

**Files:**
- Create: `components/trips/trip-form.tsx`.
- Modify: `app/trips/new/post-trip-status.tsx`, which becomes the gate plus the form.

**Interfaces:**
- Consumes: `tripErrors`, `proofError`, `postGate`, `TripDraft` (Task 3); `verificationState` (lib/account); `loadMyVerification`; `Field`/`invalidProps`; the `trips` columns and `tickets` bucket (Task 1).
- Produces: `TripForm({ initial?: Partial<TripDraft> & { id: string; proof_path: string }, onDone: (id: string) => void })`.
  - With no `initial`, it inserts a new trip.
  - With `initial`, it updates that trip (fix and change date). Keeping the existing ticket is allowed unless the landing date changed, in which case a new upload is required.

- [ ] **Step 1: Gate.** `PostTripStatus` loads the verification and maps `postGate(verificationState(v, addisToday(new Date())))`:
  - form → `<TripForm onDone={(id) => router.push("/orders/trips/" + id)} />`;
  - pending → the pending line;
  - expired → the expired copy with a `/traveler/verify` link;
  - verify → today's `<VerificationStatus verification={v} />`.
- [ ] **Step 2: `TripForm`, three steps,** following the step pattern in `app/trips/[id]/request-form.tsx`:
  1. the Ticket / Crew roster choice and the file input (`accept="application/pdf,image/jpeg,image/png,image/webp"`). Check `proofError`; for images, also `createImageBitmap`;
  2. a country select over `countryLabel`, a city and an airport (uppercased on save), and the landing date;
  3. free kg, shop-by, the note, the customs tick, and the crew tick when the proof is a roster.
  - **Submit:** upload to `tickets/<uid>/<crypto.randomUUID()>.<ext>`, then insert or update with `customs_agreed_at: new Date().toISOString()` (the trigger stamps the real time), then show the after-submit copy and a "See your trips" button that calls `onDone`.
  - **Errors:** show the database error message for the trigger's known exceptions; otherwise "Couldn't post your trip. Please try again."
- [ ] **Step 3:** Run `npm run lint`. Expected: no errors.

### Task 5: Orders → Trips list and the trip page

**Files:**
- Modify: `app/orders/page.tsx`.
- Create: `app/orders/orders-panel.tsx`, `app/orders/trips/[id]/page.tsx`, `app/orders/trips/[id]/trip-detail.tsx`.

**Interfaces:**
- Consumes: `my_trips()` (Task 1), `tripStatusLabel` (Task 3), `TripForm` (Task 4), `useSide`, `useRequireAuth`.

- [ ] **Step 1: `OrdersPanel`.**
  - **Signed out:** the Sign in prompt, the same as the Profile panel.
  - **Receiver:** "No orders yet".
  - **Traveler:**
    - a two-button **Trips | Orders** switch (`aria-pressed`, `SideToggle` styling);
    - Trips lists `my_trips()`: upcoming trips (`arrival_date >= today`, not cancelled) first, then the rest. Each row shows `countryLabel` · city, "Lands" with the date, free kg, and the status pill from `tripStatusLabel`, and links to `/orders/trips/<id>`;
    - with no trips: "No trips yet" plus a "Post a trip" link to `/trips/new`;
    - the Orders side of the switch: "No orders yet".
- [ ] **Step 2: Trip page.** Load the trip from `my_trips()` filtered by id; if it isn't found, "Trip not found". Show:
  - the details and status pill;
  - "View ticket", which opens a signed `tickets` URL (300 s);
  - for needs_fix: the reason and "Fix and resubmit", which renders `TripForm` prefilled;
  - for checking and live: "Change date", which renders `TripForm` prefilled with only the dates and proof to change, and "Edit kg and note", an inline form updating `free_kg` and `note` (1–50 kg) that shows "Saved";
  - for anything but cancelled: "Cancel trip" → a confirm "Cancel this trip? Receivers won't see it any more." → `update ... set status = 'cancelled'`.
- [ ] **Step 3:** Run `npm run lint && npm run build`. Expected: both succeed, and the build lists `/orders`, `/orders/trips/[id]` and `/inbox`.

### Task 6: Admin ticket queue (`/admin/trips`)

**Files:** Create `app/admin/trips/page.tsx` (copy the `/admin/verifications` guard) and `app/admin/trips/trip-queue.tsx`. Modify `app/admin/verifications/page.tsx` to add a link to "Trip checks", and the new page links back.

**Interfaces:** Consumes `trips_to_check()` and `decide_trip` (Task 1).

- [ ] **Step 1: The queue.**
  - Load `trips_to_check()`, then sign every `proof_path` with `createSignedUrls(..., 300)` from `tickets`.
  - **Each card shows:** the proof (an image inline, or a PDF as an "Open ticket (PDF)" link); "Crew roster" when `proof_kind = 'roster'`; the passport legal name and given name; origin, city and airport; landing date, shop-by and free kg.
  - **Actions:** "Approve", and "Reject", which needs a reason in a textarea. They call `decide_trip`, and the card is then removed.
  - Empty state: "No trips to check".
- [ ] **Step 2:** Run `npm run lint && npm run build`. Expected: both succeed.
- [ ] **Step 3: Browser check.**
  - Against a local dev server and a test Supabase only. 0008 must be applied first, so skip this step until the user applies it to live, then run it on the dev server pointed at live.
  - Walk through: post → shown as checking in Orders → admin rejects → fix → admin approves → live → edit kg stays live → change date goes back to checking → cancel.
  - Delete the test accounts afterwards.
