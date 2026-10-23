# Database (Supabase): design

Piece 1 of 3 in connecting Zakbis to Supabase. The other two are login, then making the forms save, and each gets its own design. This piece is the schema, its rules and storage, applied to a fresh Supabase project.

## Intent
Everything the app does today runs on sample data. This piece gives the product a real database that enforces its rules itself:
- who can see what, and who can move a request forward;
- when phone numbers are revealed;
- that money figures can't be faked from the browser.

The existing `supabase/migrations/0001_buy_me.sql` predates most product decisions and was never applied, so it is replaced (my call).

## Goals
- Every decision below is enforced in the database (row-level security plus security-definer functions), not only in the UI.
- Browsing (trips, reviews, open requests) works without login. Every write requires login.
- A rerunnable SQL test proves each request path end to end, as the first migration's test did.

## Non-goals (this piece)
- The login UI, Telegram, email and the phone check (piece 2). This piece only reads the verified phone that Supabase Auth stores.
- Forms writing to the database, and uploads from the UI (piece 3).
- Screens for offers, activity, profile, admin and posting trips.
- In-app chat (never before purchase; later, if ever).

## Anti-goals
- No contact details visible before the rules allow it. That includes Telegram usernames and email addresses, which are never revealed.
- No client-settable money fields: the exchange rate, fee and status come from the database.

## Decisions made by the user
- **Login:** Telegram (main) or email code, for both sides, asked for only at an action. No SMS login.
- **Phone:** each person gives a phone number once, checked with a one-time SMS code (AfroMessage, +251 numbers only):
  - receivers verify when they pay;
  - travelers verify an Ethiopian number on landing.
- **Phone reveal:** only after the purchase, and in two halves:
  - at **purchased**, the traveler sees the receiver's number;
  - at **landed**, the receiver sees the traveler's number.

  Never Telegram or email.
- **Trip requests:** the receiver sets the reward. The traveler accepts or declines; there's no negotiation.
- **Open requests:** the receiver picks one or more origin countries and a needed-by date, and sets no reward. Travelers send **offers that name the reward**, and the receiver accepts one (the others are rejected) or rejects them.
- **Money:** the receiver pays item cost in ETB plus the reward. Zakbis keeps **9% of the reward**. The traveler's payout is item cost + reward − fee. All amounts are whole birr, rounded half up.
- **Steps:** open → awaiting payment → paid → purchased → **landed** → delivered → paid out. A trip request can also be **declined**, and the receiver can **cancel** before paying.
- **Reviews in both directions:** the receiver reviews the traveler and the traveler reviews the receiver, after delivery.
- **The traveler's photo** stays blurred until the request is accepted.
- **Fresh project:** the user is replacing their Supabase project with a fresh one, so the schema applies from scratch. Before applying, the builder confirms with the user that the target project is the new, empty one. The builder never drops existing tables themselves.

## Data model (my calls unless marked above)
- **`profiles`:** `id` (→ `auth.users`), `first_name`, `photo_blur_path` and `photo_path`, `verified` (set by an admin only; what earns it is still undecided), `is_admin`, `created_at`.
- **Phone:** no own table. It's read from `auth.users.phone` with `phone_confirmed_at`, which Supabase fills in when piece 2 verifies the number. Only security-definer functions read it.
- **`payout_accounts`** (decided by the user: payouts go to an account the user enters, not their verified phone):
  - One row per user: `method` (`telebirr` | `bank`), `account_name`, `account_number`, and `bank_name` for bank transfers.
  - Readable and writable only by its owner. Admins can read it.
  - A traveler must have one before marking a request delivered, so the payout is never blocked (my call).
  - Receivers may add one for refunds (my call).
- **`fx_rates`:** `currency` (USD, GBP, CNY, AED) and `etb_per_unit`, admin-maintained.
- **`trips`:**
  - `traveler_id`, `origin_country` (US/GB/CN/AE), `origin_city`, `origin_airport`, `shop_by`, `arrival_date` (≥ `shop_by`), `free_kg` (> 0), `note`, `created_at`.
  - Publicly listed while `shop_by ≥ today` (Addis date).
- **`requests`** (one table for both kinds):
  - **Common columns:** `kind` (`trip` | `open`), `receiver_id`, `traveler_id`, `item_name`, `item_url`, `screenshot_path`, `quantity`, `notes`, `unit_price`, `currency`, `fx_rate` (locked at insert), `reward_etb`, `fee_etb` (generated, `round(reward_etb * 9 / 100)`), `status`, `receipt_path` and timestamps.
  - **A link or a screenshot is required:** at least one of `item_url` / `screenshot_path`.
  - **`kind = trip`:** `trip_id` and `reward_etb` are required. `traveler_id` comes from the trip.
  - **`kind = open`:** `countries` (a non-empty array) and `needed_by` (3–60 days ahead at insert, Addis date) are required, and `reward_etb` is null until an offer is accepted.
- **`offers`:** `request_id`, `traveler_id`, `trip_id` (the trip they'll carry it on), `reward_etb` (≥ 1), `status` (pending, accepted, rejected or withdrawn), with one live offer per traveler per request.
- **`handover_codes`:** created with each request, and readable only by the receiver (as in the first migration).
- **`payments`:** `kind` (`escrow` | `payout` | `refund`), `amount_etb`, `proof_path`, `status`. An escrow proof can be inserted only by a receiver with a confirmed phone. Its amount is set by the database (the request's total), not the browser. Refunds are recorded by an admin; how much to refund in a dispute is the admin's decision (my call).
- **`reviews`:** `request_id`, `author_id`, `subject_id`, `rating` (1–5), `text`, `created_at`. Allowed only once the request is delivered, one per author per request, and only between that request's receiver and traveler.
- **Stats view:** a public, read-only `traveler_stats` view with the rating average, review count and completed deliveries, used for the cards. The same view exists for receivers.

## Rules (who may move what)
All status changes go through functions; there are no direct updates.
- **Trip request:** the trip's traveler accepts (→ awaiting payment) or declines (→ declined).
- **Open request:** a traveler may offer only when their trip matches the request:
  - the trip's origin is one of the request's countries;
  - the trip lands on or before `needed_by`;
  - the trip's `shop_by` is today or later.

  This is the same rule as `isVisibleToTrip` in `lib/open-requests.ts`. When the receiver accepts an offer, the request takes that offer's traveler, trip and reward and moves to awaiting payment, and the other offers become rejected.
- **paid:** set by an admin after checking the escrow proof.
- **purchased:** the traveler, with a receipt.
- **landed:** the traveler, and only once their phone is confirmed and starts with 251.
- **delivered:** the traveler, entering the correct handover code, with a payout account on file.
- **paid out:** an admin, after sending the payout to the traveler's payout account and recording it in `payments`.
- **cancelled:** the receiver, before paying, and not while an escrow proof is waiting for the admin (my call). An admin can cancel at any time, and records any refund.

## Phone reveal function
`counterpart_phone(request)` returns:
- for the **traveler**, the receiver's confirmed phone, when the status is purchased or later;
- for the **receiver**, the traveler's confirmed phone, when the status is landed or later;
- otherwise, null.

A number already revealed stays visible after a cancellation, so a half-finished handover can be sorted out (my call).

## Visibility
- **Readable without login (the anon role):**
  - listed trips;
  - open requests that are still live (not expired);
  - each profile's public fields (first name, blurred photo, verified);
  - the stats views and reviews.
- **Everything else:** only the receiver and the traveler on that request, plus admins.

## Storage (my calls)
- **`screenshots`:** public read with unguessable paths, because open requests are browsable without login. Product screenshots aren't sensitive.
- **`photos-blur`:** public. The browser makes the blurred copy at upload time (piece 3).
- **`photos`:** private. Only travelers' real photos are ever revealed: the receiver sees one through a signed URL once their request with that traveler is accepted (awaiting payment or later), and it stays visible after a later cancellation. A traveler who has only made an offer sees just the public fields. Receivers' real photos are never revealed (my call).
- **`proofs`** (payment proofs and receipts): private, readable by the request's parties and admins.
- Uploads go under `<user id>/…`.

## Testing
- Rewrite `supabase/tests/buy_me_flow.sql`, run against a throwaway local Postgres with auth and storage stand-ins as before. It covers:
  - the trip request (accept, decline and the full path to paid out);
  - the open request (an offer, a non-matching offer refused, accepting an offer rejects the others, and the reward and fee are set);
  - the phone reveal at each step;
  - the +251 check on landed;
  - reviews (only after delivery, once each, in both directions);
  - anonymous reads allowed and anonymous writes refused.
- Then apply to the fresh Supabase project, after the user confirms it.

## Left to the builder
Index choices, exact function names and signatures, and how the stand-ins model `auth.users.phone` and `phone_confirmed_at`.

## Follow-ups
- Piece 2: login.
- Piece 3: saving and uploads.
- Admin screens to confirm payments and set exchange rates.
- Deciding what earns "verified".
