# Post a trip, admin-checked: design

## Intent
Verified travelers post the trip they're taking to Addis so receivers can ask them to bring things. A trip is only worth something to a receiver if it's real, so every trip needs a ticket, and for now **an admin checks every ticket by hand** before the trip appears on Explore. Reading tickets automatically with AI comes later, once real users are signing up (the user doesn't want an AI API key yet). This piece also brings in the new tab bar, because the traveler's posted trips live in the new Orders tab.

## Decided by the user
- **A ticket is required for every trip.** Accepted: an e-ticket PDF, an app screenshot, or a photo of an agency itinerary.
- **An admin checks every ticket.** No automatic reading or checks for now.
- **Hidden until approved.** Receivers can't see a trip while it waits for the admin. Once approved, it shows on Explore with "Ticket checked".
- **Verification comes first.** The Post tab lets a traveler post only once their verification is approved.
- **Flight moved or cancelled:** this piece adds "Change date" (with a new ticket) and "Cancel trip" (off Explore at once). Telling receivers, and their choice between a refund and another trip, belong to the later Orders/Activity piece.
- **Customs:** every traveler ticks "I'll only carry items allowed by my airline and Ethiopian customs and declare what's required". Crew also tick "My airline allows me to carry items for others". Nothing in the product suggests crew bags aren't scanned.
- **Airline crew are supported:** a roster or duty-schedule screenshot replaces the ticket.
- **Privacy:** receivers see only the trip card (origin, landing date, shop-by, free kg, the traveler's first name and blurred photo) plus "Ticket checked". The ticket file stays private to the traveler and admins.
- **Trips list:** lives in the traveler's **Orders** tab, behind a **Trips | Orders** switch, showing each trip's status, with Change date and Cancel.
- **New tab bar, the same on both sides:** **Explore · Orders · Post (raised, centre) · Inbox · Profile**.
  - **Explore:** browsing trips for receivers (today's `/` page), open requests for travelers (today's `/requests`).
  - **Orders:** replaces Activity. For receivers, everything they asked for.
  - **Inbox:** order updates. Empty state: "No updates yet".
  - There's no chat.

## Goals
- A verified traveler posts a trip in under two minutes from their phone.
- An admin can approve or reject a trip from one card, without opening anything else.
- No unchecked trip ever reaches a receiver.

## Non-goals (later pieces)
- **Explore reading real trips.** Explore keeps its sample data in this piece; the next piece ("save for real") switches it to approved trips from the database. The access rules here must already hide unchecked trips, so that piece only changes the page.
- **The contents of the receiver's Orders and the Inbox.** Both are placeholders here.
- Notifying receivers about date changes or cancellations, and refunds.
- AI ticket reading and flight-data lookups.
- The crew ID at verification (an "I'm airline crew" flag plus a badge photo). This is a small separate change before launch (my call).
- Moving admin to its own subdomain.

## Anti-goals
- An unchecked or rejected trip readable by anyone but its traveler and admins, whether through the database or the page.
- A traveler without approved verification (pending, rejected, expired or not started) able to create a trip, enforced in the database and not just the page.
- A ticket file readable by anyone but its owner and admins.
- A traveler able to mark their own trip approved.

## How it works (my calls unless marked above)

### Trip states
- **checking:** submitted, waiting for an admin. Hidden.
- **live:** approved. Shown on Explore until the shop-by date passes, as `trips` does today.
- **needs fix:** rejected with the admin's reason. Hidden.
- **cancelled:** the traveler cancelled. Hidden, final.

**Changes to a trip:**
- **Change date** (new ticket, new landing date and shop-by date) puts the trip back to **checking**, hidden until approved again.
- **Fixing a "needs fix" trip** works the same way: edit and resubmit, back to **checking**.
- **Editing free kg** or the note on a live trip doesn't need a new check, because the ticket doesn't prove them. The trip page has a small "Edit kg and note" action for this (my call).
- **Requests already on a trip** (none exist yet, because requests don't save until the next piece): Cancel and Change date are always allowed and never blocked by them. The user decided that a moved or cancelled trip means telling the receiver, who then chooses a refund or another trip; that handling belongs to the Orders/Activity piece. New requests and offers are only accepted on **live** trips.
- **Editing anything else** (origin, dates, ticket) always goes back to **checking**. This is enforced in the database, not just the page.

### The Post tab (`/trips/new`), for travelers
- **Gate, in the existing `SideGate side="traveler"`:**
  - verification approved with a valid passport → the form;
  - pending → "We're still checking your documents.";
  - not started or rejected → today's `VerificationStatus` with its link;
  - expired → "Your passport has expired." plus "Renew verification".
- **Step 1, proof:**
  - a choice between "Ticket" (default) and "Crew roster";
  - one upload taking a PDF or an image, up to 10 MB;
  - images are decoded before upload, as the photo uploads already do;
  - the file goes to a private bucket under the traveler's own folder, like the identity files.
- **Step 2, details:**
  - where you fly from: country, city and airport. The origin countries are the existing `country_code` values, and the airport is a 3-letter code;
  - the date you land in Addis;
  - no flight numbers or connections, because the admin reads them from the ticket.
- **Step 3:**
  - free kg;
  - the shop-by date, on or before landing, as the schema already requires;
  - an optional note;
  - the customs tick (plus the crew tick for a roster). Agreement is stored on the trip as `customs_agreed_at`, with the crew tick implied by `proof_kind = roster`, so admins have a record when revoking someone (my call).
- **Submit:** "We're checking your ticket. Your trip will show on Explore once it's approved." with a link to Orders → Trips.

### Orders tab (`/orders`)
- **Travelers:** a **Trips | Orders** switch, with Trips selected by default.
  - Trips lists each trip with its origin, landing date, free kg and a status pill: "Checking ticket", "Live", "Fix needed" or "Cancelled". Past trips sit at the bottom.
  - Tapping a trip opens its own page, at a route separate from the receiver's `/trips/[id]`:
    - the details and the ticket file, through a signed link;
    - for "Fix needed", the admin's reason with "Fix and resubmit", which reopens the form prefilled;
    - "Change date" on checking and live trips;
    - "Cancel trip", with a confirm.
  - The Orders side of the switch: "No orders yet".
- **Receivers:** "No orders yet" for now.

### Inbox tab (`/inbox`)
"No updates yet" on both sides.

### Admin: ticket queue (`/admin/trips`)
- It sits beside `/admin/verifications`, with the same admin-only 404 guard, until the admin subdomain piece.
- **Each card shows:**
  - the ticket or roster: an image inline, or a PDF opened through a signed link;
  - what the traveler entered;
  - the traveler's passport legal name and given name, from their verification.
- **The admin checks** that the name matches, that the flight lands at ADD on the stated date, and that it leaves from the stated city or airport.
- **Approve** → live. **Reject** needs a reason → needs fix.
- Both go through one admin-only database function, like `decide_verification`.

### Database (one new migration)
- **`trips` gains:**
  - `status`: checking, live, needs_fix or cancelled;
  - `proof_kind`: ticket or roster;
  - `proof_path`;
  - `rejection_reason`;
  - `decided_at` and `decided_by`.
- **The "listed trips" policy** shows only `status = 'live'` trips to others, plus the existing owner, admin and receiver-of-a-request rules.
- **Creating a trip** requires approved verification, with the passport valid through the landing date, not just today. Otherwise the trip would quietly drop off Explore partway through (my call).
- **Only the trip card columns are readable by others.** `proof_kind`, `proof_path`, `rejection_reason`, `decided_by` and `customs_agreed_at` stay owner- and admin-only. `proof_kind = roster` would reveal that someone is airline crew.
- **Owners can no longer delete trips.** Cancel is the only way out, and cancelled is final.
- **Migration:** existing rows are assumed to be test data, because the forms never saved trips. Check the live table before applying.
- **Owner inserts and updates** can't set the status to live, and changing a proof-relevant field resets the status to checking. This follows the same pattern as the verification submit trigger.
- **A new private storage bucket** for proofs, with owner and admin read and owner insert, following the `passports` bucket's policies.
- **SQL tests** in the existing harness cover each anti-goal.

### Tab bar
- `lib/sides.ts` `tabsFor` returns the five tabs for both sides. Explore and Post point to each side's own page, and `TabLabel` changes to match.
- `homeFor` stays "the first tab".
- `/activity` didn't exist as a page, so nothing needs redirecting.

## Left to the builder
- Component split, the step UI (reuse the existing request-form step patterns), and the airport input.
- Whether Change date and Fix reuse the posting form or a smaller one.
- The exact status pill colours, following `DESIGN.md`.
- Loading and error states, following existing patterns.
