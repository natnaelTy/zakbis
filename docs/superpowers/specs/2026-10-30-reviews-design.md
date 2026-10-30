# Reviews: design

## Intent
After an order ends, each side reviews the other, so the next person can tell a reliable traveler or receiver from an unreliable one, and Zakbis notices someone who keeps letting people down.

There's no chat on Zakbis, so reviews are where communication is judged: the two sides talk on the phone from "I'm in Addis" onwards, and the review asks how easy that was. Receivers judge travelers on **communication, speed and politeness**; travelers judge receivers on the same, plus how clear the request was.

## Decided by the user
- **Both sides review each other.** Traveler reviews and receiver reviews stay separate, as decided in the role-switch piece.
- **No chat.** Communication is rated through a tag ("Easy to reach").
- **A review is:** 1–5 stars, optional tags from a fixed list, and an **optional written comment**.
- **Cancelled or refunded orders can be reviewed** too, not only delivered ones.
- **Taken from other marketplaces:**
  - reviews stay hidden until both sides have reviewed;
  - a 14-day review window;
  - a private note to Zakbis;
  - reviews only on real orders;
  - "New" until a few reviews;
  - tag counts on the card;
  - report a review.
- **Later, not in this piece:** a public reply, and badges.
- **Skipped:** rating the platform itself.
- **A bad record is flagged to an admin**, for both travelers and receivers.

## My calls (the user can override)
- **Which orders can be reviewed:** delivered or paid out, plus orders cancelled after payment, meaning `refund_decided_at` is set. Orders declined, expired or cancelled before payment can't be, because there was no deal.
- **Tags (fixed lists, any number):**
  - receiver about traveler: **Easy to reach, On time, Polite, Item as described**;
  - traveler about receiver: **Easy to reach, On time, Polite, Clear request**.
- **The comment:** up to 1,000 characters, run through the same contact-details check as request notes (`has_contact`).
- **The private note:** optional, up to 1,000 characters, seen only by admins, and *not* contact-filtered, so people can report "he asked me to pay him directly".
- **When the window opens:** when the order is delivered or paid out, or when a refund is decided. Both sides get an Inbox and Telegram note ("How was Tewodros? Leave a review"). There's one reminder on day 7 to anyone who hasn't reviewed. The window closes after 14 days.
- **Hidden until both:** a review is visible to the person reviewed, and to the public, only once both sides have reviewed or the 14 days have passed. Before that, the author sees their own review and nobody else does, except admins.
- **No editing** after submitting. One review per person per order, as the table already enforces.
- **Shown:**
  - "New traveler" or "New receiver" until a person has **3 visible reviews**, then the average (one decimal) plus tag counts ("Polite · 12");
  - travelers on the trip card and trip page, which already show a rating and reviews;
  - receivers on the requests travelers see: their Explore, the open-request page, and the order page.
  - Comments are shown with the author's first name and the month.
- **Reporting:** the person reviewed can report a review once, with a fixed reason: contact details, abusive, or not true. Reported reviews go to the admin list. The admin **hides** it, which drops it from the average and the public view, or **keeps** it.
- **Flags**, checked whenever a review becomes visible. A person is flagged when, among reviews about them on that side:
  - 2 of their last 10 visible reviews are 1–2 stars, or
  - their average is below 3.5 with at least 3 visible reviews.
  
  Hidden reviews don't count. Flagged people appear on a new admin **"Reviews to check"** page with their recent reviews and private notes. The admin can:
  - **dismiss** the flag, which comes back only after another low rating that's newer than the dismissal;
  - **revoke** a traveler's verification, using the existing revoke: no new trips or prices, and paid orders carry on;
  - **block** a receiver from new requests and offers, with a new switch: paid orders carry on, and the admin can unblock.
- **A blocked receiver** who tries to post a request sees "Your account can't make new requests. Contact support."
- **Blocking closes everything not yet paid.** Blocking a receiver cancels their open requests and pending offers, and their orders waiting for payment with no screenshot sent. The travelers involved get a note. This works the same way a trip change closes things in "Save for real". A screenshot already sent, and paid orders, carry on. Every pricing and payment function also refuses a blocked receiver.
- **"Low" always means 1–2 stars.** After a dismissal, either flag rule can bring the person back, but only once a new 1–2 star review becomes visible after the dismissal. A steady 3.2 average doesn't re-flag on its own.
- **Travelers see receivers' comments too:** the 5 most recent visible reviews with tags and comments, on the open-request page and the order page, the same way receivers see travelers' reviews on the trip page.
- **Admins are told:** each new flag and each new report sends every admin an Inbox and Telegram note through the existing `notify`, once per flag or report, and the item also appears on the "Reviews to check" page.

## Goals
- Every finished or failed paid order gets reviews from both sides, without nagging.
- One angry review can't define a person, and nobody can retaliate after seeing the other side's review.
- Zakbis learns about people who keep letting others down before many others are hurt.
- No contact details leak through reviews.

## Non-goals (later pieces)
- Public replies to reviews.
- Badges such as "Trusted traveler".
- Rating Zakbis itself.
- Editing or deleting a review after submitting.
- Automatic suspensions without an admin.
- Moving admin to its own subdomain.

## Anti-goals
- **Seeing the other side's review before writing yours.**
- **Reviews without a real order,** or more than one per person per order.
- **Contact details in a public comment.**
- **Private notes leaking** to the person reviewed or to the public.
- **A blocked or revoked person's existing paid orders breaking.**

## Constraints
- **The existing schema:**
  - `reviews` (0001): `rating` 1–5, `text` required and 1–1,000 characters, unique per `(request_id, author_id)`;
  - the "reviews public" select policy;
  - a direct insert policy using `can_review` (delivered or paid out only);
  - the `traveler_stats` and `receiver_stats` views (0001, recreated in 0003 and 0005), counting every review;
  - the trip page, which reads `reviews` directly;
  - `lib/trips.ts`, which reads `traveler_stats`.
- **Changes to the existing schema:**
  - `text` becomes optional;
  - writes go through a security-definer function instead of the insert policy, so the window and the contact check are enforced;
  - public reads must respect hidden-until-both and admin-hidden reviews, and the private note must never be readable except by admins;
  - the stats views count only visible reviews.
- **Status changes** go through security-definer functions that lock the row and check the caller.
- **The deadline job:** the window close, the day-7 reminder and reveals by time ride on the existing every-minute `run_deadlines()`.
- **The migration** is applied by the user inside `begin;`/`commit;`.

## Left to the builder
- Exact layouts: the review card on the order page, the tag chips, and the review list on trip and request pages, within the existing patterns.
- How "visible" is computed: a stored timestamp set by the job, or computed on read.
- Table and column names, and how tags are stored.
- Whether the admin's "Reviews to check" list also holds reported reviews, or they get a separate list.
