# Request an Item: design

## Intent
A receiver in Addis has found a product online and wants a specific traveler, e.g. Hana flying Dubai → Addis, to buy it and bring it. They already have the product link and a screenshot. This screen turns that into a clear request that Hana can accept or decline, with the receiver knowing exactly what they'll pay in ETB before they send it.

## Goals
- Send a complete request in under a minute using the link and screenshot the receiver already has.
- Show the cost in ETB live as they type, at a rate that is visibly locked when they send.
- Make it obvious that nothing is paid until the traveler accepts.

## Non-goals (this round)
- Saving anything. "Send request" shows a success state but does not persist. The database and login get connected in a separate step.
- Chat, negotiation and counter-offers. The traveler only accepts or declines (decided by the user).
- Open requests that aren't tied to a trip (a separate screen).

## Anti-goals
- Any way to contact the traveler before they've bought the item. No chat and no phone number until the request is "purchased" (decided by the user).
- Showing the Zakbis fee as a charge to the receiver.

## Money rules (decided by the user)
- The receiver pays **item cost in ETB + reward**.
- Zakbis keeps **9% of the reward only**.
- The traveler's payout is **item cost + reward − 9% of the reward**. It shows as a locked balance on the traveler's side until the handover code is entered.
- Worked example: item AED 120 at 38.50 = 4,620 ETB; reward 800 ETB. The receiver pays 5,420 ETB, Zakbis keeps 72 ETB, and Hana receives 5,348 ETB.

## Screen (route `/trips/[id]`; tapping a trip tag opens it)
1. **Header:** a back link to Trips, then the trip's bag tag (reuse `components/trip-tag.tsx` in a non-link form) so the receiver always sees who, from where, the dates and the free kg.
2. **Product:**
   - Product link (URL input, paste-friendly).
   - Screenshot (image upload, reusing `components/ui/image-uploader.tsx`).
   - A link or a screenshot is required; either is enough (changed by the user 2026-10-20). A typed link must be valid.
3. **Item:**
   - Item name (required).
   - Quantity stepper (min 1).
   - Notes (optional, e.g. size, color, model).
4. **Price:**
   - The price shown online plus a currency select (USD, GBP, CNY, AED), defaulting to the trip's origin currency.
   - The ETB equivalent appears live beside it, with the line "1 AED = 38.50 ETB · locked when you send".
5. **Reward:** an amount in ETB (required, > 0) with a one-line hint about what it's for: thanking the traveler for shopping and carrying.
6. **Summary:** item cost (ETB, × quantity), reward, and "You pay" total. No fee line.
7. **Send:** a sticky "Send request" button, with the line "You won't pay anything until Hana accepts" above it.
8. **Success state:** in place of the form, confirm the request was sent to Hana, recap the item and the total, and say what happens next ("Hana will accept or decline. You'll pay once Hana accepts."). Show a link back to Trips.

## Rounding (my call)
- All ETB amounts are whole birr. Line total = round(unit price × quantity × rate), rounded once, half up.
- Fee = round(9% × reward), half up. Payout = line total + reward − fee.
- The UI never shows santim.

## Copy (my call)
Refer to travelers by name ("once Hana accepts"), never by pronoun. Trips have no gender field.

## Data this round (my call)
- Trips and exchange rates are sample data in one shared module, so Browse Trips and this screen read the same trips.
- Sample rates (labeled sample): USD 141.40, GBP 180.00, CNY 19.90, AED 38.50 ETB.
- Unknown trip id → Next.js `notFound()`.

## Constraints
- Follow `DESIGN.md` (Bag Tag world) and `PRODUCT.md`: body text ≥ 16px, Green / Brand only as a fill with near-black text, every price shown in its currency and in ETB, one primary action.
- Mobile-first: 390px wide, sticky send button above the bottom tab bar. On desktop, the same single-column form in the wider container.
- Use existing components: `Input`, `Textarea`, `Select`, `Field`, `Label`, `Button`, `ImageUploadField`. Note: `ImageUploadField` builds `aspect-[${aspectRatio}/1]` at runtime, which Tailwind can't generate. Fix it with an inline `aspectRatio` style.

## Validation (my call)
- Required: a link (a valid http(s) URL) or a screenshot, item name, price > 0, reward > 0.
- Errors appear inline under each field on submit, then update live. The button stays enabled; submitting with errors focuses the first invalid field.

## Left to the builder
Component structure, form-state approach (plain React state is fine), the money math as a small pure function with a unit check, and the exact copy beyond what's quoted above.

## Follow-ups (not this round)
- Move the phone reveal in `supabase/migrations/0001_buy_me.sql` from "paid" to "purchased" (only `counterpart_phone()` changes).
- Store the service fee as 9% of the reward when payments are built.
- In-app chat after "purchased".
