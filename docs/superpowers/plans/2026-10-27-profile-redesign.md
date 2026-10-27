# Profile Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** turn `/profile` into a settings-style Account page, following the user's Pairdel screenshot:
- a title;
- a Receiving | Traveling toggle;
- a profile row;
- icon rows that lead to four small sub-pages.

**Architecture:**
- **Two pure helpers** in `lib/`, with unit tests: the verification status label, and payout validation.
- **One shared `PayoutFields` component** used by verification and the new payout page.
- **`profile-panel.tsx`** is rewritten as the Account list.
- **The existing pieces move into sub-pages:** the name form, `PhotoUpload`, the sign-in cards, and `VerificationStatus`.
- **No database changes.**

**Tech Stack:** Next.js 16.2, React 19, Tailwind, lucide-react, Supabase JS, `node --test`, `npm run lint` (typecheck), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-27-profile-redesign-design.md`

## Global Constraints

- **Look and feel:** follow `DESIGN.md`.
  - Inter; ink text; the brand-green fill for the active toggle pill and actions; `hairline` dividers; 16px body; 13px secondary.
  - Every row is at least 56px tall (touch target). Pages stay inside `AppShell active="Profile"` and `md:max-w-xl`.
- **Exact copy:**
  - **Page and toggle:** title "Account"; toggle "Receiving" and "Traveling".
  - **Profile row:** "Edit profile". With no side: "Choose how you'll use Zakbis".
  - **Rows:** "Verification", "Payout method", "Ways to sign in", "Help & support", "Sign out".
  - **Verification statuses:** "Checking", "Verified", "Action needed", "Passport expired".
  - **Back link:** "Account".
  - **Name prompt:** "Add the first name travelers will see".
  - **Traveler name hints:** "From your passport", "Shown once you're verified".
- **Help & support:** `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`. The row isn't rendered when that's unset.
- **The account ID is not shown anywhere.**
- **Switching sides on Account stays on `/profile`.** The one exception: switching to traveling when not verified with a valid passport pushes `/traveler/verify`. `SideGate` is unchanged.
- **Commits:** only when the user says so.

## Review Focus

1. **A pending traveler taps Verification:** they see the status ("We're checking your documents…"), never the submission form. → Task 3 browser check.
2. **A rejected traveler:** sees the reason and "Fix and resubmit". → Task 3 browser check.
3. **Toggle to Receiving with no receiver name:** the inline name prompt appears, an empty name is refused, and saving it switches sides and stays on Account. → Task 2 browser check.
4. **Signed in with no side:** neither pill is filled, the profile row isn't a link, and only Ways to sign in, Help and Sign out are listed. → Task 2 browser check.
5. **An approved traveler with an expired passport:** the row reads "Passport expired", and toggling to Traveling pushes `/traveler/verify`. → Task 1 unit test and Task 2 check.

---

### Task 1: Pure helpers and shared payout fields

**Files:**
- Create: `lib/account.ts`, `lib/account.test.ts`, `components/traveler/payout-fields.tsx`
- Modify: `app/traveler/verify/verify-flow.tsx` (use `payoutErrors` and `PayoutFields` for step 3)

**Interfaces (produces):**
- `type VerificationState = "none" | "pending" | "verified" | "rejected" | "expired"`.
- `verificationState(v: { status: "pending" | "approved" | "rejected"; passport_expiry: string } | null, today: string): VerificationState`. An approved row with `passport_expiry < today` gives `"expired"`.
- `verificationLabel(s: VerificationState): { text: string; tone: "muted" | "good" | "bad" } | null`:
  - `"none"` → `null`;
  - `"pending"` → `{ text: "Checking", tone: "muted" }`;
  - `"verified"` → `{ text: "Verified", tone: "good" }`;
  - `"rejected"` → `{ text: "Action needed", tone: "bad" }`;
  - `"expired"` → `{ text: "Passport expired", tone: "bad" }`.
- `type Payout = { method: "telebirr" | "bank"; account_name: string; account_number: string; bank_name: string }`, moved out of `verify-flow.tsx`.
- `payoutErrors(p: Payout): Record<"accountName" | "accountNumber" | "bankName", string>`, partial: the three rules and messages copied verbatim from `verify-flow.tsx` step 3.
- `PayoutFields({ value, onChange, errors }: { value: Payout; onChange: (p: Payout) => void; errors: Partial<Record<string, string>> })`: the step-3 markup, moved here as is.

- [ ] **Step 1: Write `lib/account.test.ts`:**
  - `verificationState(null, "2026-10-27") === "none"`;
  - pending → `"pending"`;
  - approved with expiry `"2027-01-01"` → `"verified"`;
  - approved with expiry `"2026-10-26"` → `"expired"`;
  - rejected → `"rejected"`;
  - `verificationLabel("expired")` deep-equals `{ text: "Passport expired", tone: "bad" }`, and `verificationLabel("none") === null`;
  - `payoutErrors({ method: "bank", account_name: "", account_number: "12", bank_name: "" })` has exactly the keys `accountName`, `accountNumber`, `bankName`;
  - a valid Telebirr payout (`"Hana"`, `"0911 000 001"`) → `{}`.
- [ ] **Step 2:** Run `node --test lib/account.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `lib/account.ts`.
- [ ] **Step 4:** Run `node --test lib/account.test.ts`. Expected: PASS.
- [ ] **Step 5:** Create `PayoutFields`. In `verify-flow.tsx`, step 3 renders `<PayoutFields>`, and `check(3)` uses `payoutErrors`.
- [ ] **Step 6:** Run `npm run lint`. Expected: no errors.

### Task 2: The Account page

**Files:**
- Create: `components/profile/settings-row.tsx`, `components/profile/side-toggle.tsx`
- Modify: `app/profile/page.tsx` (title "Account"), `app/profile/profile-panel.tsx` (rewrite)

**Interfaces:**
- Consumes: `verificationState` and `verificationLabel` (Task 1); `useSide` and `switchSide`; `loadMyVerification`; `receiverPhotoSrc`; `my_photo_path` (rpc).
- Produces:
  - `SettingsRow({ href, icon, label, status, tone, destructive, onClick })`: a `Link`, or a `button` when `onClick` is given. It shows the icon in brand-text green, the label, an optional status in the tone's color, and a chevron unless `destructive`.
  - `SideToggle({ side: Side | null, onPick: (s: Side) => void, busy: boolean })`: two buttons in a mist-background pill track, with `aria-pressed`. The active one is filled brand-green with ink text.

- [ ] **Step 1: The panel loads, in one `Promise.all`:**
  - the user;
  - `profiles.first_name` and `receiver_photo_path` (never `photo_path`);
  - the verification (`status, passport_expiry, given_name`);
  - `my_photo_path()` signed to a URL when on the traveler side;
  - `payout_accounts.method, bank_name`.
- [ ] **Step 2: Render it.**
  - **Signed out:** the existing prompt and Sign in button.
  - **Signed in:**
    - `SideToggle`;
    - the inline name form, when `askName`;
    - the profile row: an avatar of 56px, the photo or a green-tint circle with the initial or a `User` icon. The row is a `Link` to `/profile/edit` only when there's a side;
    - a hairline;
    - the rows. Verification and Payout method appear on the traveler side only. The Payout status shows "Telebirr" or `bank_name`;
    - Help, when the env var is set;
    - a gap, then Sign out.
- [ ] **Step 3: Toggle logic.** Keep today's `switchTo`, with two changes:
  - after a switch to receiving, stay put (drop the `router.push("/")`);
  - switching to traveling pushes `/traveler/verify` unless `verificationState(...) === "verified"`.
  - `saveName` (with `askName`) switches and stays put.
- [ ] **Step 4:** Run `npm run lint`. Expected: no errors. Browser check on `npm run dev` (Review Focus 3, 4, 5): toggle both ways; the no-name prompt refuses an empty name; there's no account ID anywhere.

### Task 3: Sub-pages

**Files:**
- Create:
  - `components/profile/sub-page.tsx`: `SubPage({ title, children })`, with the `AppShell`, an "Account" back link in the trip page's `ChevronLeft` style, and an h1.
  - `app/profile/edit/page.tsx` plus `edit-panel.tsx`.
  - `app/profile/sign-in/page.tsx` plus `sign-in-panel.tsx`.
  - `app/profile/verification/page.tsx`.
  - `app/profile/payout/page.tsx` plus `payout-panel.tsx`.

**Interfaces:**
- Consumes: `PayoutFields`, `payoutErrors` and `Payout` (Task 1); `PhotoUpload`; `VerificationStatus`; `useSide`; `useRequireAuth`.

- [ ] **Step 1: `/profile/edit`,** by side:
  - **Receiver:** the first-name form (`update` only, "Saved"), plus `<PhotoUpload side="receiver" />`.
  - **Traveler:** the read-only given name with its hint, plus `<PhotoUpload side="traveler" />`.
  - **No side:** a link back to Account.
- [ ] **Step 2: `/profile/sign-in`.** Move the Telegram, Google and Email cards, `AddEmail`, and the taken-account messages out of `profile-panel.tsx` unchanged. `connectGoogle` redirects to `/auth/callback?next=/profile/sign-in`.
- [ ] **Step 3: `/profile/verification`:** `<VerificationStatus />`. In `verification-status.tsx`, an approved row with `passport_expiry < addisToday` shows "Your passport has expired." plus the `/traveler/verify` link "Renew verification". The other states are unchanged.
- [ ] **Step 4: `/profile/payout`.**
  - Load the caller's `payout_accounts` row into `PayoutFields`.
  - **Save:** validate with `payoutErrors`, then `upsert({ user_id, ...fields, bank_name: method === "bank" ? bank_name.trim() : null })` (the owner policy covers insert and update). Show "Saved" on success, or "Couldn't save. Please try again.".
  - Signed out → `requireAuth`.
- [ ] **Step 5:** Run `npm run lint`, then `npm run build`. Expected: both succeed, and the build lists `/profile/edit`, `/profile/sign-in`, `/profile/verification` and `/profile/payout`.
- [ ] **Step 6: Browser check** (Review Focus 1 and 2): every row opens its page and the back link returns; a pending or rejected traveler sees the status, not the form; saving a payout persists after reload.
