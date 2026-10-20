# Post an Open Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A receiver posts an open request at `/post` (countries, product, price, needed-by date), with no reward field, and sees a success state. Nothing is saved.

**Architecture:**
- The pure rules go in `lib/open-requests.ts` with node tests: visibility, the date range, Addis "today", the default currency and the countries sentence.
- The fields shared with Request an Item move into `components/request/item-fields.tsx` as a hook plus components. Both forms use them.
- `/post` is a server page that renders the client `PostRequestForm`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, date-fns, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-post-open-request-design.md`. Also see `docs/superpowers/specs/2026-10-19-request-an-item-design.md` for the shared field rules.

## Global Constraints

- Follow `DESIGN.md` and `PRODUCT.md`:
  - Body text is at least 16px. 13px is allowed only for captions and labels.
  - `bg-primary` is a fill only, with `text-primary-foreground` on it. Green text uses `text-brand-text`.
  - Every price is shown in its currency and in ETB.
- The open request has **no reward field** and **no "You pay" total**.
- Exact copy:
  - Under the heading: "Travelers flying to Addis can offer to bring it. You choose who."
  - Under the price: "Travelers name their reward when they offer. You only pay once you accept an offer."
  - Summary row: "Reward: set by the traveler's offer".
  - Above the button: "You won't pay anything until you accept a traveler's offer".
  - Button: "Post request".
  - Errors: "Pick at least one country" and "Pick the date you need it by".
  - Success heading: "Your request is live".
  - Success line: "Travelers flying from {countries} who land by {d MMM} can offer to bring it. You choose who."
  - Success links: "Back to trips" and "Post another".
  - Rate line: "1 {CUR} = {rate} ETB · locked when you post".
- Needed-by: min is today + 3 days and max is today + 60 days, with today in Addis time (UTC+3). A typed date out of range gets the same error.
- Currency: follows the first still-picked country in tap order until the user changes it by hand. It's USD before any pick, and it never changes after a manual pick.
- Request an Item must behave exactly as it does today.
- Nothing persists. No chat and no phone.
- Commit only if the user asks.

## Review Focus

1. **Request an Item still works after the refactor:**
   - The Hana example shows "You pay 5,420 ETB".
   - An empty submit shows 5 errors and focuses the link field.
   - Keyboard removal of the screenshot works.

   Covered by Task 2 Step 4.
2. **Deselecting all countries after typing a price** keeps the price, falls back to USD only if the currency was never changed by hand, and shows the country error on submit. Covered by Task 1's `defaultCurrency` test and Task 3 Step 5.
3. **A needed-by date typed by keyboard outside 3–60 days,** or before today, shows "Pick the date you need it by". Covered by Task 1's `inNeededByRange` test.
4. **Near midnight,** "today" must be Addis's date, not UTC's: 22:30 UTC is already tomorrow in Addis. Covered by Task 1's `addisToday` test.
5. **Picking a currency by hand, then tapping more chips,** leaves the currency alone. Covered by Task 3 Step 5.

---

### Task 1: Open-request rules

**Files:**
- Create: `lib/open-requests.ts`
- Test: `lib/open-requests.test.ts`

**Interfaces:**
- Consumes: `Trip`, `originCurrency` from `lib/sample-data.ts`; `Currency` from `lib/money.ts`. Use `.ts` extensions in relative imports in this file and its test, so `node --test` can run them.
- Produces:
  - `type Country = Trip["originCountry"]`
  - `type OpenRequest = { countries: Country[]; neededBy: string }`. ISO dates are `YYYY-MM-DD`.
  - `isVisibleToTrip(req: OpenRequest, trip: Trip, today: string): boolean`
  - `addisToday(now: Date): string`
  - `neededByRange(today: string): { min: string; max: string }`
  - `inNeededByRange(date: string, today: string): boolean`
  - `defaultCurrency(picked: Country[]): Currency`
  - `countryList(picked: Country[]): string`
  - `countryLabel: Record<Country, string>` = `{ US: "USA", GB: "UK", CN: "China", AE: "Dubai" }`

- [ ] **Step 1: Write the failing tests**

```ts
const trip = { ...trips[0] }; // Hana: AE, shopBy 2026-11-08, arrival 2026-11-12
test("visible when country matches, lands by neededBy, can still shop", () =>
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-12" }, trip, "2026-11-01"), true));
test("hidden for other countries", () =>
  assert.equal(isVisibleToTrip({ countries: ["US"], neededBy: "2026-12-01" }, trip, "2026-11-01"), false));
test("hidden when trip lands after neededBy", () =>
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-11" }, trip, "2026-11-01"), false));
test("hidden when trip is past shopBy", () =>
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-12-01" }, trip, "2026-11-09"), false));
test("hidden when neededBy has passed", () =>
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-12" }, { ...trip, shopBy: "2026-11-20" }, "2026-11-13"), false));
test("addisToday is UTC+3", () => {
  assert.equal(addisToday(new Date("2026-10-20T22:30:00Z")), "2026-10-21");
  assert.equal(addisToday(new Date("2026-10-20T20:59:00Z")), "2026-10-20");
});
test("neededByRange is +3..+60 days", () =>
  assert.deepEqual(neededByRange("2026-10-20"), { min: "2026-10-23", max: "2026-12-19" }));
test("inNeededByRange", () => {
  assert.equal(inNeededByRange("2026-10-23", "2026-10-20"), true);
  assert.equal(inNeededByRange("2026-12-19", "2026-10-20"), true);
  for (const d of ["2026-10-22", "2026-12-20", "", "nonsense"]) assert.equal(inNeededByRange(d, "2026-10-20"), false, d);
});
test("defaultCurrency follows the first picked country, USD when none", () => {
  assert.equal(defaultCurrency([]), "USD");
  assert.equal(defaultCurrency(["AE", "US"]), "AED");
});
test("countryList joins with 'or'", () => {
  assert.equal(countryList(["AE"]), "Dubai");
  assert.equal(countryList(["AE", "US"]), "Dubai or the USA");
  assert.equal(countryList(["US", "GB", "CN"]), "the USA, the UK or China");
});
```

- [ ] **Step 2: Run it and check that it fails**
  - Run: `node --test lib/open-requests.test.ts`
  - Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lib/open-requests.ts`**
  - ISO date strings compare lexicographically.
  - Do date math with `addDays(parseISO(today), n)` and `format(…, "yyyy-MM-dd")` from date-fns.
  - `addisToday` = `new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10)`.
  - `countryList` writes "the USA" and "the UK" in the sentence. `countryLabel` keeps the chip labels.
- [ ] **Step 4: Run it and check that it passes**
  - Run: `node --test lib/open-requests.test.ts lib/money.test.ts`
  - Expected: all pass.
- [ ] **Step 5: Commit** (only if asked).

### Task 2: Extract the shared item fields (no behavior change)

**Files:**
- Create: `components/request/item-fields.tsx` (`"use client"`)
- Modify: `app/trips/[id]/request-form.tsx`

**Interfaces:**
- Produces, from `components/request/item-fields.tsx`:
  - `Field` (moved unchanged from request-form).
  - `useItemFields(defaultCurrency: Currency)` returns:
    - `{ link, setLink, file, setFile, fileReject, setFileReject, item, setItem, qty, setQty, notes, setNotes, price, setPrice, currency, setCurrency, unitPrice: number | null, rate: number, itemEtb: number | null }`
    - `errors: { link?, screenshot?, name?, price? }`, with the same messages as today.
  - `<ItemFields f={ReturnType<typeof useItemFields>} show={(id) => string | undefined} travelerName?: string rateNote: string priceHint?: React.ReactNode />`. It renders the product link, screenshot, item name, quantity, notes and price with currency, the "≈ … ETB" line, and the rate line using `rateNote` ("send" or "post"). `travelerName` is set → hint "So {name} buys exactly the right one."; otherwise → "So the traveler buys exactly the right one."
  - `<SendBar note: string label: string />` (the sticky bar, moved unchanged).
- Consumes: `request-form.tsx` keeps its reward field, summary, submit and `Sent` view, and builds on these pieces.

- [ ] **Step 1: Move the code. Don't rewrite it.**
  - The JSX, classes and ids (`link`, `screenshot`, `name`, `price`, `*-field`, `*-error`) stay identical, so the existing focus and aria wiring keeps working.
  - The `show`/`invalid` helpers stay in each form. Pass `invalid` into `ItemFields` too, if the boundary needs it.
- [ ] **Step 2: Type-check**
  - Run: `npm run lint`
  - Expected: no errors.
- [ ] **Step 3: Build and serve**
  - Run: `npm run build && npx next start -p 3123`
- [ ] **Step 4: Regression check with playwright-cli at 390×844 on `/trips/t1`**
  - Expected: an empty submit shows the same 5 errors and focuses `#link`.
  - Expected: the Hana example shows "You pay 5,420 ETB".
  - Expected: USD shows "≈ 16,968 ETB".
  - Expected: Enter on "Remove screenshot" removes the preview.
  - Expected: Send shows "Request sent to Hana".
- [ ] **Step 5: Commit** (only if asked).

### Task 3: `/post` page and PostRequestForm

**Files:**
- Create:
  - `app/post/page.tsx` (server)
  - `app/post/post-request-form.tsx` (`"use client"`)

**Interfaces:**
- Consumes:
  - From Task 1: `Country`, `countryLabel`, `countryList`, `defaultCurrency`, `addisToday`, `neededByRange`, `inNeededByRange`.
  - From Task 2: `useItemFields`, `ItemFields`, `Field`, `SendBar`.
  - `etb` from `lib/money`.
- Produces: the route `/post`.

- [ ] **Step 1: `app/post/page.tsx`**
  - `AppShell active="Post"` and `<main>` laid out like the trip page.
  - `<h1>` "Post a request" (`text-2xl font-bold`) and the line under the heading.
  - `<PostRequestForm />`.
- [ ] **Step 2: Countries**
  - State `picked: Country[]` in tap order, and `currencyTouched: boolean`.
  - Chips are `<button type="button" aria-pressed>` inside a `role="group"` labelled "Bring it from", with `id="countries"` on the first chip.
  - Selected chips use the existing filter-chip "on" style: `border-foreground bg-foreground text-background`.
  - While `!currencyTouched`, the currency is `defaultCurrency(picked)`. Changing the select sets `currencyTouched = true`.
- [ ] **Step 3: Fields**
  - `<ItemFields rateNote="post" priceHint=…>`, where `priceHint` is the reward line.
  - Then "Needed by": `<input type="date" id="neededBy">` with `min` and `max` from `neededByRange(addisToday(new Date()))`, styled like `Input` (`h-11 rounded-lg border-input bg-card px-3 text-base`).
  - There's no reward field.
- [ ] **Step 4: Summary, validation, success**
  - Summary rows: "Item ({qty} × {price} {CUR})" → `etb(itemEtb)` or "—", then "Reward: set by the traveler's offer". There's no total.
  - Error order: countries, link, screenshot, name, price, neededBy.
  - Focus the first invalid field. For countries, focus `#countries`.
  - `SendBar` with the button "Post request".
  - Success view: the heading (focused), a recap with thumbnail, "{item} × {qty}" and "Item cost ≈ {etb}", the success line using `countryList(picked)` and `format(parseISO(neededBy), "d MMM")`, then "Back to trips" (`/`) and "Post another". "Post another" resets the form by remounting it with a `key` counter.
- [ ] **Step 5: Verify**
  - Run: `node --test lib/*.test.ts && npm run lint && npm run build`
  - Expected: all pass.
  - Run playwright-cli at 390×844 on `/post`, and expect:
    - An empty submit shows 6 errors, and focus lands on `#countries`.
    - Tapping Dubai then USA sets the currency to AED. Deselecting Dubai changes it to USD. Picking GBP by hand, then tapping China, keeps GBP.
    - Price 120 AED shows "≈ 4,620 ETB".
    - A needed-by date of today + 2 shows the date error.
    - Valid submit shows "Your request is live" and "Travelers flying from Dubai or the USA who land by …".
    - The Post tab shows as active.
  - Also on `/?from=CN`: "Post a request" opens `/post`.
  - Save `.impeccable/review/post-mobile.png` and `.impeccable/review/post-desktop.png` (1440×900) and check them visually.
- [ ] **Step 6: Commit** (only if asked).
