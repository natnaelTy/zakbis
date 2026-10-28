# Save for real: design

## Intent
Until now, Zakbis showed sample trips, and its request forms showed a success screen without saving anything. This piece makes the marketplace real from the first tap to money in Zakbis's account:

- a receiver finds a real, admin-checked trip and asks the traveler to bring something, or posts an open request any matching traveler can answer;
- the traveler and receiver agree on a reward through a short price back-and-forth;
- the receiver pays Zakbis by Telebirr or bank transfer, and an admin confirms the payment;
- both sides are told about every step in their Inbox and by Telegram.

What happens after payment (shopping, landing, handover, payout, phone numbers) is the next piece.

## Decided by the user

### Trip requests (receiver asks a specific traveler)
- The receiver sends the item details **without a reward**. The request form loses its reward field.
- The traveler sees the request in **Orders** and either **names a reward (ETB)** or **declines**.
- The receiver then **accepts and pays** (total = item price in ETB + reward), **suggests a lower reward**, or **declines**.
- The traveler has **48 hours** to give the first answer, with a reminder at the 24-hour mark. Silence closes the request and the receiver is told.

### Price back-and-forth (both kinds of request)
- A receiver's suggestion must be **lower** than the traveler's last price.
- The traveler answers a suggestion by **accepting it** or **naming a new price that is at or above the suggestion**. The traveler can also decline.
- The receiver may suggest **at most 3 times**. After the third, the receiver can only accept or decline.
- Each later turn has **24 hours**, or until the end of the trip's shop-by day if that comes sooner. A missed turn closes that offer.
- Both sides see the **history** of prices.

### Open requests (folded into this piece)
- On their **Explore**, travelers see the open requests their live trips can serve.
- A traveler sends an **offer with a reward**, choosing which of their live trips it's for.
- The receiver sees every offer on the request and negotiates with each one by the same rules.
- **Accepting one offer closes the others.** Offers are **private**: each traveler sees only their own.
- The request closes on its **needed-by date**.

### Payment (manual for launch, no gateway)
- After accepting a price, the receiver has **24 hours** to pay, with a reminder at the 20-hour mark. Silence cancels the order and the traveler is told.
- The receiver chooses **Telebirr or bank transfer**. The screen shows Zakbis's account details, the exact total, and copy buttons.
- The receiver uploads a **screenshot** of the transfer. **Uploading stops the clock**, so the time an admin takes to check doesn't count.
- An admin **confirms** the payment, or **rejects it with a reason**. After a rejection, the receiver uploads again within the time that was left.
- Once confirmed, the order shows **"Paid"**, and the traveler is told to go shopping.

### Notifications
- **Telegram bot messages and the in-app Inbox**, on every step.
- People who signed in only with Google or email get the Inbox only, unless they connect Telegram.

### Keeping people on Zakbis
- **There's no chat.** The Inbox holds system notes only.
- Declining uses a **fixed list of reasons**: "Too heavy", "Can't find it", "Not enough space", "Price too low", "Other". There's no free text.
- The database **rejects phone numbers, @handles, email addresses and links** in free-text fields (item name, notes, trip note). The product link field is still a link.
- **Phone numbers are revealed only close to the handover**, so **no phone number appears anywhere in this piece**. The handover piece decides the exact moment.

### Confirmed with the user (proposed by me, then approved)
1. **The receiver's Explore** shows only live trips whose shop-by date hasn't passed, with today's country filters. It replaces the sample trips.
2. **The traveler's Explore** shows open requests that at least one of their live trips matches: the trip's country is one of the request's countries, the trip lands on or before the needed-by date, and its shop-by date hasn't passed (the existing `isVisibleToTrip` rule).
3. **The receiver can cancel** any time before paying, meaning before a payment screenshot is waiting for the admin. **A traveler can withdraw an offer** any time before the receiver accepts it.
4. **When a trip is cancelled or its date changes** (the trip goes back to checking), every request on it that is still being priced or waiting for payment closes, and the receiver is told.
5. **Zakbis's payment details** live in settings, so changing them needs no code. The payment screen stays hidden until they're set.
6. **Telegram sign-in asks for permission** to receive messages from the Zakbis bot.
7. **The Inbox** lists notes newest first, with unread notes in bold and a dot on the Inbox tab. Tapping a note opens its order.
8. **Payment checks** get their own admin page beside Trip checks.
9. The plan is split into **several stages, each testable on its own**.

### Answered after the builder check
- **The order link in a Telegram message** opens Telegram's built-in browser, which isn't signed in. The person signs in once there with the normal sign-in screen, or uses "Open in browser". There are no magic sign-in links, and no Mini App in this piece; a Mini App can come later.
- **Pay by the shop-by day:** the payment deadline is 24 hours or the end (Addis time) of the trip's shop-by day, whichever comes first. A screenshot uploaded in time can still be confirmed after that day, since the traveler can still shop before flying.
- **Trip changed after a screenshot was uploaded:** the admin's payment card reads "Trip changed: refund the receiver", with no Confirm or Reject. The admin sends the money back outside the app, then taps **Mark refunded**, which closes the order as cancelled and tells the receiver. The payment row is marked refunded (a `refund` payment row or status; the builder chooses).

## Goals
- A receiver goes from Explore to "payment sent" in under three minutes on a phone.
- A traveler answers a request in two taps (a price and Send) from the Telegram message.
- Every deadline is enforced by the server, not by someone's open browser tab.
- An admin confirms a payment from one card, without opening anything else.

## Non-goals (later pieces)
- Everything after "Paid": purchase, receipt, landing, handover code, payout, reviews, and the phone-number reveal and phone check (AfroMessage).
- Refunds, and the refund-or-move choice when a paid order's trip moves or is cancelled.
- A payment gateway (Chapa).
- Item weight and tracking the traveler's remaining free kg.
- Chat of any kind.
- An admin screen for exchange rates.
- Moving admin to its own subdomain.

## Anti-goals
- **Money set by the browser.** The total, the reward on an accepted order and the amount owed are computed or checked in the database, never trusted from the page.
- **Either side breaking the price rules**, through the page or by calling the database directly:
  - a suggestion that isn't lower than the traveler's last price;
  - a fourth suggestion;
  - a traveler price below the receiver's suggestion;
  - acting out of turn;
  - acting after the deadline.
- **A traveler seeing another traveler's offer** or price on the same request.
- **A request reaching a trip that isn't live**, or an offer using a trip that isn't live.
- **Contact details getting through** any free-text field, or any phone number shown anywhere.
- **A deadline that only passes when someone opens the app.** Expiry and reminders run on the server, on a schedule.
- **A payment screenshot readable by anyone** but the receiver, the traveler on that order, and admins (as today).
- **Paying twice for one order**, or two accepted offers on one open request.

## How it works

### One shape for both kinds of request
Every price back-and-forth lives on an **offer**: one traveler, one trip, one request.

- **Open request:** any matching traveler creates an offer by naming a price.
- **Trip request:** there's no offer until the traveler answers. Naming a price creates the single offer on that request.

From that point on, both kinds behave the same: whose turn it is, the current price, the receiver's suggestions used (0–3), the deadline and the history.

Accepting a price, by the receiver accepting the traveler's price or the traveler accepting the receiver's suggestion, fixes the reward on the request and moves it to **awaiting payment** with a payment deadline 24 hours away.

### Turns and deadlines
| Moment | Who acts | Deadline | Reminder |
|---|---|---|---|
| A trip request arrives | Traveler: name a price or decline | 48 h | at 24 h left |
| The traveler names or changes a price (or makes an offer) | Receiver: accept, suggest lower (if fewer than 3 used) or decline | 24 h | 4 h before (my call) |
| The receiver suggests a lower price | Traveler: accept it, name a price ≥ the suggestion, or decline | 24 h | 4 h before (my call) |
| A price is accepted | Receiver: pay and upload the screenshot | 24 h, or the end of the shop-by day if sooner | 4 h before |
| The admin rejects a screenshot | Receiver: upload again | the time that was left (at least 2 h, my call) | — |

- Every pricing deadline is also capped at the end (Addis time) of the trip's shop-by day, and for open requests at the end of the needed-by day.
- **A missed deadline** closes:
  - **trip request, any pricing turn:** the whole request, since it only has one traveler;
  - **open request:** only that offer, and the request stays open for other travelers;
  - **payment:** the order is cancelled.
- In every case both sides get a note.

### Things that close a request or offer
- **The receiver cancels:** allowed before a screenshot is waiting. Every pending offer closes.
- **A traveler withdraws an offer:** before acceptance only. On a trip request, this closes the request.
- **Another offer is accepted:** the other offers close with the note "The receiver chose another traveler".
- **The needed-by date passes** on an open request still being priced: the request and its offers close. An order already accepted or paid isn't affected.
- **One offer per traveler per request, ever** (my call). Once a traveler's offer is declined, expires or is withdrawn, they can't offer on that request again, so a declined traveler can't restart the back-and-forth. A receiver *can* send a new trip request to the same trip after a decline, since it may be a different item. Several requests to one trip can be in progress at once (one per item).
- **A trip is cancelled or goes back to checking:** every request on that trip still being priced or awaiting payment closes, along with every pending offer that uses the trip.
  - If a screenshot is already waiting, the order stays, and the admin refunds it by hand (see "Answered after the builder check").
  - **Paid orders:** in this piece, a traveler with a paid order on a trip can't cancel it or make any edit that sends it back for checking (origin, dates, ticket). Edits to kg and note still work. They see "This trip has paid orders. Contact support to change it." The handover piece adds the real flow. (My call: until that piece exists, it protects receivers' money.)

### Payment
- The amount is the request's `total_etb` (item price × quantity × the rate frozen when the request was made, plus the reward), which is already computed by the database.
- The receiver picks **Telebirr** or **bank**. The screen shows:
  - **Telebirr:** the Zakbis Telebirr number and account name;
  - **bank:** the bank name, account number and account name;
  - the exact total;
  - copy buttons;
  - the time left.
- The screenshot goes to the existing private `proofs` bucket. The `payments` row records the chosen method.
- **Admin page `/admin/payments`:** each card shows the order (item, receiver first name, traveler first name), the amount owed, the method, the screenshot inline, and how long it has been waiting. It has Confirm, and Reject with a required reason.
  - The same guard as trips applies: an admin can't decide on a payment that changed since they loaded it.

### Notifications
- **Every event above writes one note per person affected:** for example "Hana named 1,200 ETB for Perfume", "Your payment for Perfume is confirmed. Hana will go shopping.", "Reminder: 4 hours left to pay for Perfume".
- **Each note** records who it's for, which side (receiver or traveler), which request, the text, when it was read, and when it went to Telegram.
- **Inbox:**
  - shows the notes for the **active side**, newest first, with unread ones in bold;
  - if the other side has unread notes, a line at the top reads "2 new on your traveling side" and switches sides when tapped;
  - opening the Inbox marks the shown notes as read;
  - the tab dot reflects unread notes on the active side, refreshed on navigation (my call: no live push for now).
- **Telegram:**
  - sent only to users who have a Telegram link;
  - the chat is the user's Telegram id;
  - the message is the note text plus a link to the order on app.zakbis.com;
  - no personal details beyond first names and the item name.
  - The Telegram Login button requests write access (`data-request-access="write"`).
  - People who signed in before this change, or who declined, see a "Get updates on Telegram" link in the Inbox that opens the bot. Pressing Start in the bot lets it message them.
  - If sending fails, the note stays in the Inbox and Zakbis doesn't retry forever.

### Server schedule (my call)
Deadlines, reminders and Telegram sending run **inside Supabase**, so they don't depend on Vercel (the Hobby plan only allows daily cron jobs) or on anyone having the app open:

- **`pg_cron`** runs one job every minute that:
  - expires anything past its deadline;
  - writes the reminder notes that are due (once each);
  - sends unsent Telegram notes through **`pg_net`** to the Telegram Bot API.
- **The bot token** lives in **Supabase Vault**, never in a table or in the migration.
- **The user enables** `pg_cron` and `pg_net` in the Supabase dashboard and adds the Vault secret before applying the migration. The plan gives the exact steps.
- **The SQL tests** run on a plain Postgres without these extensions. The expiry, reminder and "which notes to send" logic is plain SQL that the tests call directly. Only the thin scheduling and HTTP call are left out of the tests.

### Screens
- **Explore (receiver, `/`):** live trips from the database, with the existing card and country filters. A trip card opens `/trips/[id]`, which reads the real trip.
- **Request form (`/trips/[id]`):** the same fields minus the reward. It saves, with the screenshot uploaded to the `screenshots` bucket, and shows "Request sent. Hana has 48 hours to answer." with a link to the order. Exchange rates come from the `fx_rates` table, not the sample data.
- **Post an open request (`/post`, receiver):** saves for real.
- **Explore (traveler, `/requests`):** the matching open requests (item, photo or link, quantity, price in ETB, countries, needed by, the receiver's first name and photo). Each card opens the request, which has **Make an offer**: pick a live trip if they have several, then type a reward.
  - With no live trip: "Post a trip to make offers" (with a link).
  - Not verified: the existing verification status.
- **Orders (receiver):** every request they made, newest first, each with a status chip ("Waiting for Hana", "Your turn", "3 offers", "Pay by 6 pm", "Checking payment", "Paid", "Closed"). "Your turn" items sort first.
- **Orders (traveler, the Orders half of the existing Trips | Orders switch):** trip requests to answer, offers they made, and accepted orders, with the same chips.
- **Order page `/orders/requests/[id]`:** the same page for both sides, with actions depending on who's looking and whose turn it is:
  - the item details;
  - for the receiver on an open request, the list of offers, each with its own price history and actions;
  - the price history ("Hana: 1,200 ETB · You suggested 900 ETB · Hana: 1,000 ETB");
  - the current total (item + reward);
  - the deadline as "Answer within 23 h";
  - the actions: Accept · Suggest lower (with "2 suggestions left") · Decline (reason list); or Name a price / Accept suggestion;
  - Cancel request (receiver), Withdraw offer (traveler);
  - once accepted, the payment section;
  - after payment, "Paid. Hana will go shopping."
- **Inbox (`/inbox`):** as described above.
- **Admin:** `/admin/payments`, linked to and from Trip checks and Verifications.

## Constraints
- **Same stack and patterns as earlier pieces:**
  - status changes only through security-definer functions;
  - row-level security plus column grants;
  - SQL tests in `supabase/tests/` run by `sh supabase/tests/run.sh`;
  - pure logic in `lib/*.ts` with `node --test` tests;
  - Solar icons from `components/icons.tsx`;
  - minimal hint text.
- **Money:** whole ETB. Rewards must be at least 1 ETB. The fee (9% of the reward, kept from the traveler's payout) is unchanged, and the receiver sees only the total.
- **New migration `0009`,** which the user applies themselves, wrapped in `begin;`/`commit;`. The live `requests` and `offers` tables are empty, so constraints can change freely, but the plan should say to check that before applying.
- **The `payments` insert policy requires `my_phone_confirmed()`.** The phone check is a later piece, so this piece drops that condition (my call). Otherwise no one could pay.
- **`fx_rates` may be empty in the live database.** The migration fills in today's sample rates where a currency is missing (my call). The user can edit them in the Supabase table editor until there's an admin screen.
- **The sample-data file** stays only where something still needs its types, and no screen shows sample trips.
- **Mobile first,** like every screen so far.

## Left to the builder
- Table and column names, the exact enum additions (for example an `expired` request or offer status), and how the price history is stored (an events table or rows per turn).
- The exact note wording, within the rules above.
- Whether the order page is one component with role branches or two.
- The contact-details pattern, as long as it catches common phone formats (`+251 9…`, `09…`, digits with spaces or dashes, 7 or more digits), `@handles`, emails, and `http`, `www.`, `t.me` and `wa.me` links, and doesn't block ordinary text like "2 pcs" or "size 42".
- How the order list queries are shaped (views or functions).
