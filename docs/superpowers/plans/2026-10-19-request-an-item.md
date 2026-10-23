# Request an Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a trip tag opens `/trips/[id]`. The receiver fills in a request (link, screenshot, item, price, reward), sees the ETB total live, and sends it to a success state. Nothing is saved.

**Architecture:**
- The money math is one pure function in `lib/money.ts`, tested with Node's built-in test runner. Node 24 runs `.ts` files directly, so no test dependency is needed.
- Sample trips and exchange rates move into `lib/sample-data.ts`, so Browse Trips and the trip page read the same data.
- The trip page is a server component that renders the bag tag and a client `RequestForm`. The form holds the state, validation, summary and success view.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, lucide-react, date-fns, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-request-an-item-design.md`

## Global Constraints

- Follow `DESIGN.md` (Bag Tag world) and `PRODUCT.md`.
- Body text is at least 16px (`text-base`). 13px is allowed only for labels above a 16px value.
- Green / Brand (`bg-primary`) is a fill only, with `text-primary-foreground` on it. Green text uses `text-brand-text`.
- Every price shows in its own currency and in ETB.
- ETB amounts are whole birr, shown like `5,420 ETB` (`toLocaleString("en-US")`). Never show santim.
- Line total = round(unit price × quantity × rate), rounded once, half up. Fee = round(0.09 × reward), half up. Payout = line total + reward − fee.
- The receiver never sees a fee line. "You pay" = line total + reward.
- Refer to travelers by name, never by pronoun.
- Exact copy:
  - "You won't pay anything until {name} accepts"
  - "1 {CUR} = {rate} ETB · locked when you send"
  - "{name} will accept or decline. You'll pay once {name} accepts."
- Nothing persists. No chat, no phone, no counter-offer UI.
- Commit steps run only if the user has asked for commits in this session. Otherwise skip them.

## Review Focus

1. **Prices with decimals or thousands separators** ("19.99", "1,200") must parse correctly. Covered by Task 1's `parseAmount` test.
2. **A link typed without a scheme** ("www.zara.com/ae/…") should be accepted and normalized to `https://`, not rejected. Covered by Task 1's `normalizeUrl` test.
3. **A zero, negative, empty or non-number price or reward** must block sending with an inline error, never produce NaN in the summary. Covered by Task 1 (parse returns `null`) and Task 4's manual check.
4. **A screenshot over 4 MB, or a non-image,** must be rejected with a visible message. Today `ImageUploadField` ignores `maxSize`. Covered in Task 4.
5. **Changing currency or quantity after typing a price** must recompute the ETB figures and the total immediately. Covered by Task 4's manual check.

---

### Task 1: Money and input parsing

**Files:**
- Create: `lib/money.ts`
- Test: `lib/money.test.ts`

**Interfaces:**
- Produces:
  - `type Currency = "USD" | "GBP" | "CNY" | "AED"`
  - `quote(input: { unitPrice: number; quantity: number; rate: number; reward: number }): { itemEtb: number; reward: number; total: number; fee: number; payout: number }`
  - `parseAmount(raw: string): number | null`: strips commas and spaces. Returns `null` for empty or non-finite input, and for anything ≤ 0.
  - `normalizeUrl(raw: string): string | null`: trims, adds `https://` when there's no scheme, and returns `null` unless the protocol is http or https and the host contains a dot.
  - `etb(n: number): string`: returns `"5,420 ETB"`.

- [ ] **Step 1: Write the failing tests in `lib/money.test.ts`** (`import { test } from "node:test"; import assert from "node:assert/strict";`)

```ts
test("spec example", () => {
  assert.deepEqual(quote({ unitPrice: 120, quantity: 1, rate: 38.5, reward: 800 }),
    { itemEtb: 4620, reward: 800, total: 5420, fee: 72, payout: 5348 });
});
test("rounds once on the line total", () => {
  assert.equal(quote({ unitPrice: 19.99, quantity: 3, rate: 141.4, reward: 500 }).itemEtb, 8480); // 8479.758
});
test("fee rounds half up", () => {
  assert.equal(quote({ unitPrice: 1, quantity: 1, rate: 1, reward: 50 }).fee, 5); // 4.5
});
test("parseAmount", () => {
  assert.equal(parseAmount("1,200"), 1200);
  assert.equal(parseAmount(" 19.99 "), 19.99);
  for (const bad of ["", "abc", "0", "-5", "1e999"]) assert.equal(parseAmount(bad), null);
});
test("normalizeUrl", () => {
  assert.equal(normalizeUrl("www.zara.com/ae/x"), "https://www.zara.com/ae/x");
  assert.equal(normalizeUrl("http://a.com"), "http://a.com/");
  for (const bad of ["", "hello", "javascript:alert(1)", "ftp://a.com"]) assert.equal(normalizeUrl(bad), null);
});
test("etb formats whole birr", () => assert.equal(etb(5420), "5,420 ETB"));
```

- [ ] **Step 2: Run it and check that it fails**
  - Run: `node --test lib/money.test.ts`
  - Expected: FAIL (cannot find module `./money.ts`).

- [ ] **Step 3: Implement `lib/money.ts` with the signatures above**
  - Use `Math.round` for rounding (all values are positive, so it rounds half up).
  - `normalizeUrl` uses `new URL()` inside try/catch.
  - Import it in the test as `./money.ts`.

- [ ] **Step 4: Run it and check that it passes**
  - Run: `node --test lib/money.test.ts`
  - Expected: all 6 tests pass.

- [ ] **Step 5: Commit** (see Global Constraints): `git add lib/money.ts lib/money.test.ts && git commit -m "feat: money quote and input parsing for requests"`

### Task 2: Shared sample data and a static trip tag

**Files:**
- Create: `lib/sample-data.ts`
- Modify:
  - `components/trip-tag.tsx`: move `Trip` to sample-data, and add a `static` variant.
  - `app/page.tsx`: import the trips instead of defining them.

**Interfaces:**
- Consumes: `Currency` from `lib/money.ts`.
- Produces:
  - `type Trip` (same fields as today), exported from `lib/sample-data.ts`.
  - `trips: Trip[]` (the four current trips, same ids `t1`–`t4`).
  - `getTrip(id: string): Trip | undefined`.
  - `rates: Record<Currency, number>` = `{ USD: 141.4, GBP: 180, CNY: 19.9, AED: 38.5 }`.
  - `originCurrency: Record<Trip["originCountry"], Currency>` = `{ US: "USD", GB: "GBP", CN: "CNY", AE: "AED" }`.
  - `TripTag({ trip, static?: boolean })`. When `static` is set, it renders a `<div>` instead of a `<Link>`, with no stub "Request ›", no hover lift and no aria-label.

- [ ] **Step 1: Create `lib/sample-data.ts`** with the exports above. Keep the `// shortcut:` comment from `app/page.tsx` here.
- [ ] **Step 2: Update `components/trip-tag.tsx` and `app/page.tsx`** to import from `lib/sample-data.ts`. Add the `static` prop by splitting the tag body into an inner component, wrapped by either `Link` or `div`.
- [ ] **Step 3: Verify**
  - Run: `npm run lint && npm run build`
  - Expected: no type errors, and the build passes.
  - Run `npx next start -p 3123`, then `/` and `/?from=AE`. Expected: identical to before (4 tags; 2 for Dubai).
- [ ] **Step 4: Commit** (see Global Constraints).

### Task 3: Trip page route

**Files:**
- Create: `app/trips/[id]/page.tsx`

**Interfaces:**
- Consumes: `getTrip`, `TripTag` (static), `AppShell`.
- Produces: the route `/trips/[id]`, which renders `<RequestForm trip={trip} />` (Task 4). Until Task 4 lands, render a placeholder `<p>`.

- [ ] **Step 1: Implement `default async function TripPage({ params }: { params: Promise<{ id: string }> })`**
  - `notFound()` when `getTrip` returns undefined.
  - `AppShell active="Trips"`.
  - A back link "‹ Trips" (`text-brand-text`, 16px) to `/`.
  - `<h1 className="sr-only">Request an item from {trip.travelerName}</h1>`.
  - `<TripTag trip={trip} static />`.
  - Main width: `md:max-w-xl` (single column on desktop).
- [ ] **Step 2: Verify**
  - Expected: `/trips/t1` shows Hana's tag with no stub link.
  - Expected: `/trips/nope` returns 404 (`curl -s -o /dev/null -w "%{http_code}" localhost:3123/trips/nope` prints `404`).
  - Expected: tapping a tag on `/` navigates to its page.
- [ ] **Step 3: Commit** (see Global Constraints).

### Task 4: Request form, summary and success state

**Files:**
- Create: `app/trips/[id]/request-form.tsx` (`"use client"`)
- Modify:
  - `app/trips/[id]/page.tsx`: render `RequestForm`.
  - `components/ui/image-uploader.tsx`: enforce the size limit, add keyboard access, and fix the skeleton's aspect ratio.

**Interfaces:**
- Consumes: `quote`, `parseAmount`, `normalizeUrl`, `etb`, `Currency` (Task 1); `rates`, `originCurrency`, `Trip` (Task 2).
- Produces: `RequestForm({ trip }: { trip: Trip })`.

- [ ] **Step 1: Fix `ImageUploadField`**
  - Add the prop `onReject?: (message: string) => void`.
  - In `handleFileChange`, reject files over `maxSize` with "Screenshot must be under 4 MB", and reject files whose type doesn't start with `image/` with "Please choose an image". In both cases, call `onReject` and don't call `onChange`.
  - Make the clickable div keyboard-operable: `role="button"`, `tabIndex={0}`, Enter and Space open the picker, and `aria-label="Add screenshot"`.
  - Replace the skeleton's runtime `aspect-[…]` class with `style={{ aspectRatio }}`.
  - Capitalize the copy: "Click to upload".
  - Delete the stray `console.log("Remove image")`.
- [ ] **Step 2: Build `RequestForm`. Field order and labels:**
  - Product link: `type="url"`, `inputMode="url"`, placeholder `https://`.
  - Screenshot: `ImageUploadField`, `aspectRatio={16/9}`.
  - Item name.
  - Quantity: a stepper of − and + buttons around a number, min 1, max 10.
  - Notes (optional): a `Textarea` with placeholder "Size, color, model…".
  - Price: a text input with `inputMode="decimal"`, plus a currency `<select>` defaulting to `originCurrency[trip.originCountry]`. Below it, live: `≈ {etb(itemEtb)}` and "1 {CUR} = {rate} ETB · locked when you send".
  - Reward (ETB): `inputMode="numeric"`, with the hint "A thank-you to {name} for shopping and carrying it."
  - Use the existing `Input`, `Textarea`, `Label`, `Button` and `Field` components where they fit.
- [ ] **Step 3: Summary block**
  - Rows: "Item ({qty} × {price} {CUR})", "Reward", then "You pay" in bold.
  - All values use `etb()`. Show "—" while the price or reward doesn't parse.
- [ ] **Step 4: Validation and send**
  - On submit, compute errors:
    - link: `normalizeUrl` is null → "Paste the product link"
    - screenshot missing → "Add a screenshot of the product"
    - name empty → "What's the item called?"
    - price null → "Enter the price shown online"
    - reward null → "Offer a reward in ETB"
  - Show each error under its field (`text-destructive`, 16px, `aria-describedby`), and focus the first invalid field. Errors re-check live after the first submit.
  - The submit button is never disabled.
  - Valid submit → a success view.
- [ ] **Step 5: Sticky send bar**
  - Fixed above the bottom tab bar on mobile (`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`). Static at the end of the form from md up.
  - Contents: the line "You won't pay anything until {name} accepts", then a full-width `bg-primary` "Send request" button.
  - Add bottom padding to the form so the bar never covers the last field.
- [ ] **Step 6: Success view** (replaces the form)
  - A check icon (`text-brand-text`) and the heading "Request sent to {name}".
  - A recap: thumbnail of the screenshot, item name × qty, and "You pay {etb(total)}".
  - The copy "{name} will accept or decline. You'll pay once {name} accepts."
  - A link "Back to trips". Move focus to the heading.
- [ ] **Step 7: Verify**
  - Run: `node --test lib/money.test.ts && npm run lint && npm run build`
  - Expected: all pass.
  - With `playwright-cli` at 390×844 and 1440×900 on `/trips/t1`:
    - Empty submit shows 5 errors, and focus moves to the link field.
    - Fill `www.zara.com/ae/x`, a screenshot, "Zara Golden Decade", price `120` AED, reward `800`. The summary shows "4,620 ETB", "800 ETB" and "You pay 5,420 ETB".
    - Switching the currency to USD updates it to "≈ 16,968 ETB".
    - Quantity 2 doubles the item line.
    - Send shows "Request sent to Hana".
    - A 5 MB file shows "Screenshot must be under 4 MB".
  - Save the screenshots to `.impeccable/review/request-mobile.png` and `.impeccable/review/request-desktop.png`, and check them visually.
- [ ] **Step 8: Commit** (see Global Constraints).
