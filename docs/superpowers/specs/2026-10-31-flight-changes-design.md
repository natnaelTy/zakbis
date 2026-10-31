# Flight changes on paid orders: design

## Intent
Once a trip has paid orders, the traveler can't change or cancel it in the app. They see "This trip has paid orders. Contact support to change it", and everything after that happens off Zakbis. This piece gives that moment a proper path. The traveler tells Zakbis their flight moved or was cancelled, an admin checks it, and each receiver decides whether to wait or take a full refund. A flight change usually isn't the traveler's fault, so it never leads to reviews against them.

## Decided by the user
- **The traveler tells Zakbis, and an admin decides.** The traveler never changes a trip's dates themselves once orders are paid. Changing dates through an admin is the exception, not routine.
- **The admin adjusts the flight date** and the receivers are told the trip was delayed.
- **A receiver who can't wait for the new date gets a full refund.**
- **If the traveler already bought the item** when a receiver takes the refund, the traveler returns it to the shop or keeps it and carries the cost.
- **A flight cancelled outright** follows the same path: the traveler tells Zakbis, an admin confirms, the trip is cancelled, every paid order is refunded automatically, and the traveler carries the cost of anything already bought.
- **No reviews** after a refund caused by a flight change.

## My calls (the user can override)
- **Where the traveler asks:** on their trip page (Orders → Trips), when the trip has paid orders, a **"My flight changed"** button replaces the "Contact support" dead end. It offers:
  - **"Moved to a new date":** the new shop-by date, the new landing date, and a new ticket. The ticket is required, uploaded to the private tickets bucket like when a trip is posted.
  - **"Cancelled":** a screenshot of the airline's notice, optional.
  
  One request can be waiting per trip at a time. The traveler sees "Zakbis is checking your flight change" until it's decided.
- **Where the admin decides:** a **"Flight changes"** section on the existing **Trip checks** page shows the old and new dates, the ticket, and the paid orders affected. The admin can **approve**, or **reject** with a reason the traveler sees.
- **While a request waits,** the every-minute job skips that trip's orders for the "not bought" hold, the missed-swap refund and the traveler no-show refund. Otherwise a slow admin would let the job blame the traveler and refund orders over an airline's delay. Every other clock keeps running. This is one check against the trip, not a pause on each order.
- **Orders waiting on a payment screenshot** stay on the existing path:
  - **On a cancellation,** the admin's Payment checks page already shows "Trip changed: refund the receiver" with "Mark refunded". The admin checks the money arrived before refunding, and the receiver is told the flight was cancelled.
  - **On a move,** the admin confirms the payment as usual. The receiver still gets the "flight moved" note and the keep-or-refund choice once the payment is confirmed.
- **Rules on new dates:** they can't be in the past. They may be earlier or later than the old ones. The new ticket replaces the trip's ticket. A traveler can't ask for a change once any order on the trip has reached "I'm in Addis"; they contact support instead.
- **Approving a move:**
  - the trip's shop-by and landing dates change and it stays live;
  - deadlines that follow the trip move with it, namely buying, "I'm in Addis" and the traveler no-show week;
  - a buy-by extension an admin gave earlier is cleared, so the new shop-by day applies;
  - unpaid requests and offers on the trip are left as they are, since their own checks still apply when a price is accepted.
- **What receivers are told** when a move is approved: "Tewodros's flight moved. Your Sneakers now arrive around 14 Nov. Keep the order or cancel for a full refund." This goes to every receiver with a paid order that hasn't reached "I'm in Addis".
- **The receiver's choice,** on the order page: a banner with **"Keep my order"** and **"Cancel and refund"**.
  - Saying nothing means keeping it. The banner stays until they tap either button.
  - "Cancel and refund" is available any time before "I'm in Addis", in case the new date slips again.
  - Refunds go into the existing refund queue on the admin Orders page.
- **Approving a cancellation:**
  - the trip is cancelled;
  - every order that's paid or bought is refunded, and the receivers are told: "Tewodros's flight was cancelled. We'll refund you 13,726 ETB." Orders waiting on a screenshot go the way described above;
  - unpaid requests and offers close, the same way a trip cancellation closes them today.
  - **Edge case:** an order already at "I'm in Addis" isn't affected, because the traveler is already in Addis.
- **No reviews:** refunds from a flight change don't open the review window.
- **Notes to the traveler:** "Zakbis approved your new dates", "Zakbis cancelled your trip and is refunding your receivers", or "Zakbis couldn't approve your flight change: {reason}".
- **Admins are told** of each new request through the existing admin note.

## Goals
- A traveler whose flight moves never hits a dead end.
- Every receiver hears about a delay and can leave with all their money.
- Admins see real proof before dates move.
- Nobody gets a bad review over an airline's decision.

## Non-goals (later pieces)
- Moving a receiver's order to another traveler.
- The traveler changing dates directly on a trip with paid orders.
- Partial refunds or compensation for delays.
- Automatically checking the new ticket.

## Anti-goals
- **Dates moving without an admin.**
- **A receiver charged anything** because of a flight change.
- **Reviews or flags caused by a flight change.**
- **Orders left stuck** on a cancelled trip.

## Constraints
- **It builds on:**
  - `trips_rules` (0009), which blocks status and date changes once a trip has paid orders;
  - `trips_guard` (0008), which sends date edits back to `checking`; admin edits bypass it with `zakbis.deciding`;
  - `decide_trip` and the Trip checks page;
  - `decide_refund` and the refund queue (0011);
  - the review-window trigger (0012), which opens on `refund_decided_at`;
  - `buy_due` (0011), which reads the trip's shop-by date unless `buy_due_at` is set;
  - the private tickets bucket (0008);
  - `notify` and `notify_admins`.
- **Status changes** go through security-definer functions that lock the rows and check the caller.
- **The migration** is applied by the user inside `begin;`/`commit;`.

## Left to the builder
- Table and column names for flight-change requests, and how refunds are marked so the review window skips them.
- Screen layouts, within the existing trip page, order page and admin patterns.
- Whether "Keep my order" is stored, or simply hides the banner for that receiver.
