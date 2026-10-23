# Post an Open Request: design

## Intent
A receiver in Addis can't find a trip that fits. Instead of waiting, they post the item once, along with the countries it can come from and the date they need it by. Travelers on a matching route then offer to bring it, and the receiver chooses which offer to accept. This screen covers only the posting.

## Goals
- Post a complete open request in about a minute, reusing everything the receiver already knows from Request an Item.
- Make the reach of the request obvious: which countries, by which date, and that the receiver chooses who brings it.

## Non-goals (this round)
- Saving anything. Posting shows a success state only. The database comes in a separate step.
- The traveler's "browse open requests and offer" screen, and the receiver's "review offers" screen. These are the next two screens.
- Posting a trip as a traveler.

## Anti-goals
- No chat and no phone numbers before the item is purchased (decided by the user, same as the rest of the app).
- No negotiation. Travelers offer, and the receiver accepts or rejects (decided by the user).

## Flow decided by the user
- The receiver must pick **at least one** origin country (USA, UK, China, Dubai) and may pick several.
- **One price**, in a currency the receiver chooses, also shown in ETB.
- A **"Needed by" date is required**. A traveler only sees the request if they fly from one of the chosen countries **and** land in Addis on or before that date. Everyone else never sees it.
- Travelers send offers, and the receiver accepts or rejects each one.
- **The receiver does not set a reward on an open request.** Each traveler's offer names the reward they want, and the receiver accepts or rejects that amount (decided by the user). There's still no negotiation, only accept or reject.

## Screen (route `/post`; reached from the Post tab and from "Post a request" on the Browse Trips empty state)
1. **Heading** "Post a request", with one line under it: "Travelers flying to Addis can offer to bring it. You choose who."
2. **Bring it from:** country chips (USA, UK, China, Dubai) with multi-select. They're toggle buttons with `aria-pressed`. At least one is required, with the error "Pick at least one country".
3. **Product, item, quantity, notes:** identical to Request an Item. A link or a screenshot is required (either is enough); notes are optional.
4. **Price:** one price plus a currency select. Until the receiver changes the currency by hand, it follows the first country they tapped that's still selected (my call). Before any country is picked it shows USD. Once they pick a currency themselves, tapping chips never changes it. It shows a live "≈ … ETB" line and "1 {CUR} = {rate} ETB · locked when you post".
5. **No reward field.** One line under the price explains it: "Travelers name their reward when they offer. You only pay once you accept an offer." 
6. **Needed by:** a required date. The earliest choice is **3 days from today** and the latest **60 days from today** (my call), with "today" in Addis time. A date typed outside that range gets the same error. Error: "Pick the date you need it by".
7. **Summary:** the item cost in ETB (× quantity), then the row "Reward: set by the traveler's offer". There's no "You pay" total, because it isn't known until an offer is accepted, and no fee line.
8. **Sticky action:** the line "You won't pay anything until you accept a traveler's offer", above the button "Post request".
9. **Success state:**
   - The heading "Your request is live".
   - A recap: thumbnail, item × qty, "Item cost ≈ …".
   - The line "Travelers flying from {countries joined with "or"} who land by {d MMM} can offer to bring it. You choose who."
   - Links to "Back to trips" and "Post another".

## Money and rounding
Rounding is unchanged from the Request an Item spec. This form only shows the item cost: round(unit price × quantity × rate), whole birr. When an offer is accepted later, the same `quote()` applies with the offer's reward, and Zakbis keeps 9% of that reward. Use `lib/money.ts` as it is.

## Visibility rule (for the next screen; recorded now)
A traveler sees an open request only when all of these hold:
- `trip.originCountry ∈ request.countries`;
- `trip.arrivalDate ≤ request.neededBy`;
- the trip can still shop: `trip.shopBy ≥ today` (my call). This excludes trips that have already landed or are past their last shopping day.

Once `neededBy` is before today, the request is hidden for everyone (my call). The function takes `today` as an argument, an ISO date in Addis time (UTC+3), so it stays pure and testable. Put this in `lib/` as a pure function with a unit test now, so the browse screen and the database work share one definition.

## Constraints
- Follow `DESIGN.md` (Bag Tag world) and `PRODUCT.md`: body text at least 16px, Green / Brand as a fill only, every price shown in its currency and in ETB.
- Reuse, don't duplicate: pull the shared fields (product, item, quantity, notes, price with currency; reward only where the form has one; summary; sticky bar) out of `app/trips/[id]/request-form.tsx` into one shared component that both forms use. Request an Item must behave exactly as it does today.
- The date uses a native `<input type="date">` with `min` and `max` (my call: the best picker on phones, and no extra code).
- Mobile first, laid out like Request an Item. The Post tab is active in the bottom nav.

## Validation
The same pattern as Request an Item: errors show inline on submit and then update live, focus moves to the first invalid field, and the button is never disabled. Order: countries, link, screenshot, item name, price, needed by.

## Left to the builder
The shared component's exact boundary and props, the chip styling within DESIGN.md, and copy beyond what's quoted.

## Follow-ups (not this round)
- Database: open requests need `countries` and `needed_by`, plus an `offers` table (traveler → request, the reward in ETB that the traveler offers, pending/accepted/rejected). The accepted offer's reward becomes the request's reward. Today `advance_request` lets the first traveler claim directly; replace that with "receiver accepts an offer".
- Screens: travelers browsing open requests and offering, and receivers reviewing offers.
