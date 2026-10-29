# After paid: design

## Intent
"Save for real" ends at **Paid**: Zakbis holds the receiver's money and the traveler is told to go shopping. Nothing on screen happens after that. This piece carries an order from Paid to money in the traveler's account:

- the traveler buys the item and proves it with a receipt and a photo, and the receiver checks the photo while a swap is still possible;
- the traveler marks that they're in Addis, which confirms their Ethiopian phone number and reveals both numbers so the two can meet;
- the handover code marks the order delivered;
- an admin pays the traveler, minus Zakbis's cut;
- every bad path (wrong item, damaged item, no-shows on either side) ends in a payout or a refund, never a stuck order.

Reviews are the next small piece, right after this one.

## Decided by the user

### Bought: receipt and item photo
- When the traveler marks the order **Bought**, they upload **the receipt and a photo of the item**. Both are required.
- The receiver sees both on the order so they can check the color, model or size **before the traveler flies**.

### The receiver checks the photo
- The receiver answers **"Looks right"** or **"Not right"**. "Not right" takes a reason from a fixed list (no free text, like declines today).
- **Silence for 24 hours counts as "Looks right"**.
- On **"Not right"**, the traveler either:
  - **swaps it**, by exchanging it or buying the exact right item, then uploads a new receipt and photo, and the receiver checks again; or
  - **can't swap it**: the order is cancelled and the receiver is refunded in full. The traveler deals with the item themselves.

### "I'm in Addis" and phone numbers
- There's **no landing time** on trips. Trips stay date-only and the Post a trip form doesn't change.
- The traveler taps **"I'm in Addis"**. That step **confirms their Ethiopian phone number by SMS code** (AfroMessage).
- A foreign SIM can't get the code, so **an Ethiopian SIM is required**. There's no fallback. The app tells travelers without one that they can **buy a SIM at Bole arrivals with their passport**.
- Phone numbers are revealed **at "I'm in Addis"**, not when the receipt is uploaded. The receiver gets: "Hana is in Addis. Call her on [number]. Pick a public place to meet for safety."

### Handover and damage
- The receiver gives the traveler the **handover code** once they have the item. The traveler enters it and the order is **delivered**.
- **Damage is the traveler's responsibility.** If the item is damaged, the receiver keeps the code and reports a problem. The admin refunds the receiver in full and the traveler is paid nothing.

### No-shows
- **Receiver can't be reached:** 1 week after "I'm in Addis" with no handover, the traveler is paid as if delivered.
- **Traveler never taps "I'm in Addis":** 1 week after the trip's arrival date, the order is cancelled and the receiver is refunded.

### Money
- **Zakbis takes a cut of the traveler's reward.**
- The receiver pays item cost plus reward, as now.
- The traveler is paid item cost plus the reward minus the cut.

- **The cut is 15% for all orders** (user, 2026-10-29). This replaces the 9% decided on 2026-10-19, which is built into `fee_etb`/`payout_etb` in `0001_buy_me.sql` and into `quote()` in `lib/money.ts`. It applies to orders already agreed as well. The live database had no real orders when this was decided.
- **Receiver never confirmed their number:** if the traveler taps "I'm in Addis" and the receiver hasn't confirmed their number, there's **no auto-payout after the week**. The order goes to the admin, who reaches the receiver and decides between refund and pay. The 1-week auto-payout applies only when both numbers were revealed.

- **AfroMessage can't send yet (user, 2026-10-29): build it and switch it on later.** Until the AfroMessage key is set, the phone-code screens say "Phone check opens soon", the way payments do today, so live orders wait at Bought. A test mode with a fixed code, for test numbers only and never on with a real key, lets the browser walk-through run end to end. Setting the key later turns it on with no code change.

### Reviews
- Not in this piece. They're the next small piece.

## My calls (the user can override)
- **The cut applies to the reward only**, never the item cost. It's stored in the database so it can change without a code change, and it's **locked on each order when the price is agreed**. Orders already agreed when this ships are moved to 15%, by the user's decision.
- **Travelers see their take-home** wherever they name or accept a price ("1,200 ETB reward, you get 1,020 ETB"), and on the order. **Receivers never see the cut.**
- **The photo check stops at the end of the shop-by day** as well as after 24 hours, whichever comes first, so a "Not right" never arrives after the traveler has flown. A swap must also be done by the end of the shop-by day; after that, "can't swap" is the only option the traveler has.
- **The traveler pays for any swap.** If the right item costs more, that's on the traveler, and the receiver's total never changes.
- **"Not right" reasons:** wrong color, wrong model, wrong size, not what I asked for, other.
- **Buying deadline:** the traveler must mark Bought by the end of the shop-by day. If they don't, the receiver gets a note and the order goes to the admin queue, so the admin can refund or allow more time. It isn't cancelled automatically, because the traveler may have bought without uploading.
- **The receiver confirms their number before they can see the traveler's.** They're asked for it on a paid order, any time before "I'm in Addis", and they're reminded when the traveler taps it. Until they confirm, they see "Confirm your number to see Hana's".
- **The traveler sees the receiver's number at the same moment**, at "I'm in Addis", if the receiver has confirmed it. This replaces the old rule that revealed it at purchase.
- **A confirmed number stays confirmed** on the account for the receiver. **The traveler gets a fresh SMS code at every "I'm in Addis" tap**, even with a confirmed number, because the code reaching a local SIM is the proof they've arrived. It costs one SMS per order. "I'm in Addis" can't be tapped before the trip's arrival date.
- **Admin outcomes**, each with a deadline after it so nothing gets stuck:
  - **Missed buying deadline:** "Refund the receiver", or "Give 2 more days", in which case the traveler can mark Bought until then and the same rule applies again after that.
  - **"I can't reach the traveler":** "Refund the receiver", or "Restart the week", which gives a fresh 7-day handover window with the same no-show rule.
  - **"Problem with the item":** "Refund the receiver", where the traveler gets nothing, or "Pay the traveler", where the item was fine and the order is treated as delivered.
- **A decided refund** shows the receiver "Refund on its way" at once, and "Cancelled, refunded" once the admin marks it refunded. The trip lock is released as soon as the refund is decided.
- **The receiver can report two kinds of problem**, both of which freeze the order's clocks and put it in the admin queue:
  - **"Problem with the item"**, after "I'm in Addis". The admin decides, normally a full refund with no payout.
  - **"I can't reach the traveler"**, after "I'm in Addis". This stops the 1-week auto-payout.
- **Reminders:**
  - the receiver, on days 3 and 6 of the no-show week ("Hana is waiting to hand over your item. Call her on [number].");
  - the receiver, on the trip's arrival day ("Hana is due in Addis today");
  - the traveler, at the start of the shop-by day if they haven't marked Bought.
- **Payout is manual**, like payments. Delivered orders, and receiver no-show orders after the week, appear in a new admin **Payouts** page with the traveler's payout account and the amount. The admin sends the money and taps **"Mark paid out"**, and the traveler gets a note.
- **Refunds stay manual:** the admin sends the money back and taps "Mark refunded", as built in "Save for real". Every refund case in this piece ("can't swap", damaged, traveler no-show, an admin-decided problem) lands the order in the same refund queue.
- **The traveler needs a payout account** before they can enter the handover code. That rule already exists in the database and stays.
- **The handover code locks after 5 wrong tries** until an admin resets it, as the database already does.
- **The receipt and item photo are private**: the receiver, the traveler and admins see them, no one else.
- **The paid-orders trip lock** from "Save for real" covers the new statuses too. A trip with orders that are bought or in Addis can't be cancelled or moved without support.
- **Notes**, in the Inbox and on Telegram, for every step: bought, photo checked or rejected, swap uploaded, can't swap, in Addis, delivered, paid out, problem reported, refund decided, no-show outcomes.

## Goals
- An order moves from Paid to Paid out with no admin work except confirming money in and out.
- The receiver catches a wrong item while it can still be swapped.
- Phone numbers are shared only when the traveler is really in Ethiopia and both numbers are real.
- No order can get stuck: every waiting state has a deadline that ends in a payout, a refund or the admin queue.

## Non-goals (later pieces)
- Reviews (the next piece).
- A landing time on trips, or meeting at the airport.
- Any non-Ethiopian phone number, or another SMS provider.
- Contact by Telegram instead of phone.
- Automatic payouts or refunds through a gateway.
- Partial refunds or haggling over damage.
- Chat of any kind.
- Moving admin to its own subdomain.

## Anti-goals
- **Revealing a phone number early:** before "I'm in Addis", or for a number that hasn't been confirmed by SMS. That applies through the page and through direct database calls.
- **Money set by the browser.** The payout amount and the cut are computed in the database.
- **A stuck order:** any status with no deadline and no admin path out.
- **Free text that carries contact details:** the "Not right" and problem reasons are fixed lists.
- **The traveler marking delivered without the code**, or either side skipping a step through the page or the database.

## Constraints
- It builds on the existing schema:
  - the `purchased` and `landed` statuses, and `receipt_path`, `purchased_at` and `landed_at` on requests;
  - `handover_codes` and `deliver()`, with its 5-try lock and `reset_handover_attempts`;
  - `phone_of()`, which reads the confirmed phone from Supabase Auth (`auth.users.phone` and `phone_confirmed_at`);
  - `counterpart_phone()`, which needs its reveal rule changed;
  - `payout_accounts`;
  - the `payments` table, with its `refunded` status and "Mark refunded";
  - the `notes` table and the every-minute `run_deadlines()` job;
  - the `advance_request()` paths for purchased and landed, which become dedicated functions, the way "Save for real" replaced the others.
- Status changes go only through security-definer functions that lock the request row, check the caller, the status and the deadline, and write notes.
- AfroMessage sends to +251 numbers only. The confirmed number must end up where `phone_of()` reads it.
- New migrations are applied by the user, inside `begin;`/`commit;`. A change to the cron job goes in `supabase/live/`.

## Left to the builder
- How the SMS code is wired up: Supabase's phone sign-in with an SMS hook to AfroMessage, or our own code table and API route. Either way, the confirmed number must land where `phone_of()` reads it.
- Exact screen layouts and copy beyond the messages quoted above, within the existing order detail, admin and Inbox patterns.
- Storage buckets and paths for the item photo. The receipt already has `receipt_path`.
- How the admin queues are split: one "Needs action" page, or separate Payouts, Refunds and Problems pages.
- Table and column names, and how the cut is stored.
