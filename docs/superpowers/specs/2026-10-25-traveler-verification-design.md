# Traveler onboarding and verification: design

Piece 1 of 3 toward real trips:
1. Traveler verification (this document).
2. Post a trip, with automatic ticket checks.
3. Requests save for real.

## Intent
A traveler handles other people's money and goods, so anyone can sign in, but only a **verified traveler** can have trips that receivers see. Verification is a one-time onboarding step that an admin reviews. It gives meaning to the **Verified** badge that PRODUCT.md listed as undecided.

## Decided by the user
- **One account type.** Everyone signs in the same way (Telegram, Google or email), and anyone can request and post requests. Becoming a traveler is an **onboarding step** on the same account.
- **What a traveler provides:**
  - a **passport photo**;
  - a **selfie**;
  - a **payout account**.
- **Review:** an **admin approves or rejects** each traveler.
- **Visibility:** a traveler's trips stay **hidden until they're approved**.
- **Retention:** passport and selfie images are **kept as long as the account exists** (for disputes). Only admins and the traveler themselves can see them.
- **Per-trip proof belongs to piece 2:** a ticket or booking upload, automatic checks, and an admin check on every traveler's first trip.

## Goals
- **One sitting:** a traveler finishes onboarding in a few minutes, on a phone.
- **Fast admin review:** an admin reviews a traveler in under a minute, on one screen.
- **Database rules:** "hidden until approved" and "only the owner and admins see identity images" are enforced by the database, not just the UI.

## Non-goals (this piece)
- Posting trips and the ticket checks (piece 2).
- Automated face matching or document AI for passports (a human reviews; my call, since volume is low at launch).
- Notifications about the decision. The traveler sees their status on Profile and when they tap "Post a trip". A Telegram bot message is a later follow-up.
- Account deletion. When an account is deleted later, its identity images must be deleted with it (a follow-up).

## Onboarding (my calls unless marked above)
Entered from **Post a trip**, which arrives in piece 2. For now it's reached from Profile through **"Become a traveler"**. It's a step-by-step page at `/traveler/verify` that works on phones:

1. **Intro:** what's needed (passport, selfie, payout account), and why: "So receivers know who's carrying their item. Only Zakbis staff see your documents."
2. **Passport:**
   - a photo of the passport's **photo page** (camera or gallery; JPEG, PNG or WebP, up to 8 MB);
   - **full name exactly as in the passport**, **nationality**, and **expiry date**.
   - The passport must not be expired.
3. **Selfie:** a photo of the traveler **holding the open passport next to their face**. It uses the front camera on phones (`capture="user"`) or a gallery upload.
4. **Payout account:**
   - Telebirr number, or bank name with account name and number;
   - this is the existing `payout_accounts` table;
   - prefilled if one already exists.
5. **Review and submit:** a summary, then **Submit for review**. Status becomes **pending**.
6. **Status screen** (also shown on Profile and in front of "Post a trip"):
   - **Pending:** "We're checking your documents. You can prepare trips, but they'll stay hidden until you're approved."
   - **Approved:** "You're a verified traveler."
   - **Rejected:** shows the admin's reason and **Fix and resubmit**, which reopens the steps with the earlier answers filled in.

## Admin review (my calls)
- **`/admin/verifications`:** admins only. Everyone else sees a 404.
  - A list of **pending** travelers, oldest first.
  - Each one opens a review card showing:
    - the passport photo and the selfie side by side (short-lived signed links);
    - the typed name, nationality and expiry date;
    - the traveler's first name and when they submitted.
  - **Approve**, or **Reject** with a required reason picked from a short list ("Photo unclear", "Name doesn't match", "Passport expired", "Selfie doesn't match", "Other") plus optional text.
- **Who is an admin:** set by hand in the database (`profiles.is_admin`). There's no admin-management screen.

## Data (my calls)
- **New table `traveler_verifications`:** one row per user.
  - **Columns:** `user_id` primary key (→ `profiles`), `legal_name`, `nationality` (ISO country code), `passport_expiry` date, `passport_path`, `selfie_path`, `status` (pending / approved / rejected), `rejection_reason`, `submitted_at`, `decided_at`, `decided_by`.
  - **The owner:** can read their own row, and insert or update it only while it's not approved. Every insert or update resets the status to **pending** and clears the decision.
  - **Approved rows are locked:** a traveler with a new passport goes through the admin again.
- **`decide_verification(user_id, approve boolean, reason text)`:**
  - admin-only;
  - sets the status, the decision fields and **`profiles.verified`** (true on approve, false on reject).
- **Verified status:** a traveler counts as **verified** when `profiles.verified` is true **and** `passport_expiry` is today or later (Addis date). A passport that expires hides the traveler's trips again until they re-verify (my call).
- **Trip visibility:** the public trips policy additionally requires the traveler to be verified. Their own trips stay visible to them and to admins.
- **Private storage bucket `identity`:**
  - **upload:** only into your own folder;
  - **read:** the owner and admins;
  - **delete:** no one through the app (evidence, the same rule as `proofs`).
- **Name matching later:** the passport name is stored as text for piece 2's ticket matching.

## Verified everywhere money moves (my calls, from the user's "only verified travelers handle goods")
- **One definition:** `is_verified_traveler(user_id)` is a security-definer function that returns true when `profiles.verified` is true **and** the passport expiry is today or later. Everything uses it:
  - the trips visibility policy;
  - `make_offer`: an unverified traveler can't offer on open requests;
  - `accept_offer`: it refuses an offer from a traveler who has since become unverified;
  - the trip-request insert trigger: a request can't be made on an unverified traveler's trip, even with its id.
- **The public badge:** reads the same rule through a public `verified` column added to `traveler_stats`, so an expired passport removes the badge too.
- **"Hidden" means no new business.** Requests already accepted, paid or purchased **carry on** to handover, so no paid escrow is stranded. An admin can still cancel any of them.
- **A receiver can always see their own request's trip:** the trips policy also lets a receiver read a trip that one of their requests uses.

## Re-verifying and revoking (my calls)
- **When a traveler can resubmit:** while rejected, or once their passport has expired. Resubmitting resets the row to **pending** and sets `profiles.verified` to false until an admin decides.
- **Revoking:** an admin can **revoke** an approved traveler (`decide_verification(approve=false)` on an approved row), for example after fraud. The admin screen gets two tabs: **Pending** and **Approved** (searchable by name). Revoking applies the same "no new business" rule.

## On the review card (my call)
- **Payout account:** the card also shows the traveler's payout account (method, account name, number). An account name that doesn't match the passport name is a common fraud signal, and it's the account the admin pays out to.
- **The onboarding payout step:** prefilled when an account already exists, so it's edited rather than skipped.

## Constraints
- **Look and feel:** follow DESIGN.md and PRODUCT.md (16px body text, existing Field, Input, Button and ImageUploadField, phone first).
- **Images:** checked in the browser and refused by the database rules if they're too big or the wrong type where possible.
- **Testing:** SQL tests for the new table and the trip visibility change, following the existing harness (`supabase/tests/run.sh`); browser checks of the onboarding steps and the admin screen.

## Left to the builder
Component structure, step navigation, and the exact copy beyond what's quoted.

## Follow-ups
- Piece 2: post a trip, with ticket checks.
- A Telegram bot message when a decision is made.
- Deleting identity images when an account is deleted.
- A re-verify reminder before a passport expires.
