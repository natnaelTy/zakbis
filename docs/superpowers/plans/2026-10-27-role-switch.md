# Traveler and Receiver Sides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one login holds a traveler side and a receiver side. The tabs, actions and profile follow the active side, and signed-out visitors see Trips with no tab bar.

**Architecture:**
- **Migration `0005`:**
  - adds `profiles.active_side` and `profiles.receiver_photo_path`;
  - makes `first_name` (now the receiver name) nullable;
  - adds `traveler_verifications.given_name`, a public `traveler_names` view, and a public `receiver-photos` bucket.
- **Client:**
  - a `useSide()` hook reads the active side;
  - a client `TabBar` inside the server `AppShell` picks the tabs;
  - the sign-in sheet gains a "side" step;
  - a `SideGate` wraps pages that belong to one side.

**Tech Stack:** Next.js 16.2, React 19, Supabase (Postgres RLS, Storage, `@supabase/ssr`), shadcn base-nova components, the SQL harness (`sh supabase/tests/run.sh`), `node --test`, `npm run lint` (typecheck).

**Spec:** `docs/superpowers/specs/2026-10-27-role-switch-design.md`

## Global Constraints

- **`type Side = "receiver" | "traveler"`,** stored in `profiles.active_side`.
  - Signed-in "finished sign-in" means **has a non-null `active_side`**, never "has a profile row".
- **The receiver name is `profiles.first_name`.** Null means the receiver side isn't set up, and making a request then raises `set up your receiver side first`.
- **The public traveler name** is `traveler_verifications.given_name`, exposed only through the `traveler_names(traveler_id, given_name)` view, and only for `is_verified_traveler`. Never expose `legal_name` publicly.
- **Photos:** JPEG, PNG or WebP, up to 8 MB (`8388608`), enforced by the bucket **and** the uploader (`maxSize={8 * 1024 * 1024}`).
  - **Traveler photo:** the existing `photo_blur_path` (bucket `photos-blur`) and `photo_path` (bucket `photos`).
  - **Receiver photo:** `receiver_photo_path` (new public bucket `receiver-photos`).
  - **Paths:** each upload uses a new path, `<uid>/<Date.now()>.<ext>`, so no storage update policy is needed.
- **Tabs:**
  - Receiver: Trips `/`, Post `/post`, Activity `/activity`, Profile `/profile`.
  - Traveler: Requests `/requests`, Post `/trips/new`, Activity `/activity`, Profile `/profile`.
  - The first tab is the side's home.
- **Exact copy:**
  - **Side question:** title "How will you use Zakbis?", with buttons "I'm traveling to Addis" and "I need items from abroad".
  - **Switching:** "Switch to traveling", "Switch to receiving". The Profile label reads "You're receiving" or "You're traveling".
  - **Gate:** "Switch to traveling to do this" or "Switch to receiving to do this", plus the switch button.
  - **Passport step field:** "First name, as in your passport". Error: "Enter your first name exactly as in your passport".
  - **Traveler name on Profile:** the given name with the hint "From your passport". Before approval: "Shown once you're verified".
  - **Placeholders:** `/requests`: "Open requests are coming soon." `/trips/new`, once verified: "Post a trip is coming soon."
- **Leave alone:** `can_see_photo()`, `traveler_stats` and `receiver_stats`, `/admin/*` routing and `is_admin`.
- **Look and feel:** follow `DESIGN.md` and the existing screens. Reads use explicit columns.
- **Commits:** only when the user asks. Apply `0005` to live Supabase only after the final review.

## Review Focus

1. **The sheet is closed at the side step, then reopened.** It reopens at the side step, with no profile row created in between. → Task 3 browser check.
2. **"Request this item", signed out, then "I'm traveling".** Nothing is sent, and the person lands on `/traveler/verify`. → Task 3 browser check.
3. **"Switch to receiving" with no receiver name.** The name is asked for first, and an empty name is refused. The database independently refuses a request from a null-name receiver. → Task 1 SQL test and Task 5 browser check.
4. **Querying `traveler_names` as anon.** It returns exactly the columns `traveler_id` and `given_name`, and only verified travelers. Pending, rejected and expired travelers are absent. → Task 1 SQL test.
5. **A 9 MB photo, or a PDF renamed `.jpg`.** The uploader refuses it, and the `receiver-photos`, `photos` and `photos-blur` buckets carry the limits. → Task 1 SQL test and Task 5 browser check.

---

### Task 1: Migration 0005 and its tests

**Files:**
- Create: `supabase/migrations/0005_sides.sql`, `supabase/tests/sides_test.sql`
- Modify:
  - `supabase/tests/helpers.sql`: `test_verify` sets `given_name = 'Test'`;
  - `supabase/tests/verification_test.sql`: owner inserts include `given_name`.

**Interfaces:**
- Produces:
  - **Columns:** `profiles.active_side text check (active_side in ('receiver','traveler'))`, `profiles.receiver_photo_path text`, `traveler_verifications.given_name text check (length(trim(given_name)) between 1 and 40)`.
  - **View:** `traveler_names(traveler_id uuid, given_name text)`.
  - **Bucket:** `receiver-photos`.

- [ ] **Step 1: Write `sides_test.sql`** in the existing style (`begin; … rollback`-style, with the local `must_fail` helper). Assert:
  - **Profile rows:**
    - an authenticated user inserts `{id: self, active_side: 'traveler'}` with no `first_name`, and it succeeds;
    - inserting `active_side: 'admin'` fails;
    - updating another user's `active_side` affects 0 rows.
  - **Request needs a receiver name:** the traveler-only user inserting an open request fails with `set up your receiver side first`.
  - **Given name on submission:** an owner verification insert without `given_name` fails with `first name`; with `given_name` it lands `pending`.
  - **Approving needs a given name:** `decide_verification(uid, true)` on a row whose `given_name` is null (set via `zakbis.deciding`, as `test_verify` does) fails with `first name`.
  - **`traveler_names`, read as anon:**
    - the columns are exactly `{traveler_id, given_name}`, checked via `information_schema.columns`;
    - a `test_verify`'d user appears with `'Test'`;
    - a pending user doesn't appear;
    - a verified user whose `passport_expiry` is set in the past doesn't appear.
  - **Storage:**
    - an upload to `receiver-photos/<self>/x.jpg` succeeds;
    - an upload to `receiver-photos/<other>/x.jpg` fails;
    - `storage.buckets` rows `receiver-photos`, `photos` and `photos-blur` have `file_size_limit = 8388608` and `allowed_mime_types = '{image/jpeg,image/png,image/webp}'`.
  - **Existing rows:** the harness can't test the backfill, because it loads every migration before any rows exist. Keep it as one `update` in the migration and check it when applying to live (see the end of this plan).
- [ ] **Step 2:** Run `sh supabase/tests/run.sh`. Expected: `FAIL migration` is absent, and `FAIL sides_test.sql` is present.
- [ ] **Step 3: Write `0005_sides.sql`:**
  - **Profiles:**
    - `alter column first_name drop not null`;
    - add the two columns;
    - `update profiles set active_side = 'receiver' where active_side is null`;
    - extend the column grants: select `active_side, receiver_photo_path` to `anon, authenticated`; insert and update `active_side, receiver_photo_path` to `authenticated`.
  - **Verifications:** add `given_name`.
    - `create or replace traveler_verifications_submit()`: copy the 0004 body and add, after the owner check, `if coalesce(trim(new.given_name), '') = '' then raise exception 'enter your first name as in your passport'; end if;`.
    - `create or replace decide_verification`: copy the 0003 body. When approving, raise `no first name to approve` if `given_name` is null.
  - **`create view traveler_names as select user_id as traveler_id, given_name from traveler_verifications where is_verified_traveler(user_id);`** plus `grant select … to anon, authenticated`. Owner-run like `traveler_stats`, so RLS on the base table stays closed.
  - **`create or replace requests_before_insert()`:** copy the 0003 body and add, after the login check, the `first_name is null` → `set up your receiver side first` check.
  - **Buckets:**
    - insert `receiver-photos` (public, 8 MB, the three types);
    - `update storage.buckets` sets the same limits on `photos` and `photos-blur`;
    - policy `receiver photo upload` allows insert to `authenticated` when `bucket_id = 'receiver-photos'` and the folder is `auth.uid()`.
    - Delete is already covered by "manage own files".
- [ ] **Step 4:** Run `sh supabase/tests/run.sh`. Expected: every line is `PASS`.

### Task 2: Sides in the client, and the tab bar

**Files:**
- Create: `lib/sides.ts`, `lib/sides.test.ts`, `components/auth/use-side.tsx`, `components/tab-bar.tsx`
- Modify: `components/app-shell.tsx`

**Interfaces:**
- Produces:
  - `lib/sides.ts`:
    - `export type Side = "receiver" | "traveler"`;
    - `export type TabLabel = "Trips" | "Requests" | "Post" | "Activity" | "Profile"`;
    - `export function tabsFor(side: Side): { href: string; label: TabLabel }[]`;
    - `export function homeFor(side: Side): string`.
  - `components/auth/use-side.tsx`:
    - `useSide(): { side: Side | null | undefined; refresh: () => Promise<void> }`, where `undefined` means loading and `null` means signed out or no side;
    - `export async function switchSide(to: Side): Promise<boolean>`, which updates `profiles.active_side` for the current user;
    - after a switch or sign-in, call `router.refresh()` or `refresh()` so the tab bar updates.
  - `AppShell({ active: TabLabel; children })`: the prop type widens. The page call sites stay unchanged.

- [ ] **Step 1: Write `lib/sides.test.ts`:**
  - `tabsFor("receiver").map(t => t.label)` deep-equals `["Trips","Post","Activity","Profile"]`;
  - `tabsFor("traveler").map(t => t.href)` deep-equals `["/requests","/trips/new","/activity","/profile"]`;
  - `homeFor("traveler") === "/requests"`;
  - `homeFor("receiver") === "/"`.
- [ ] **Step 2:** Run `node --test lib/sides.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `lib/sides.ts`.** Icons stay in `tab-bar.tsx`, mapped by label: Trips `Plane`, Requests `ShoppingBag`, Post `Plus`, Activity `ListChecks`, Profile `User`.
- [ ] **Step 4:** Run `node --test lib/sides.test.ts`. Expected: PASS.
- [ ] **Step 5: Implement `useSide`, `switchSide` and `TabBar`** (`"use client"`).
  - **Moving the nav:** `TabBar` takes over the `<nav>` markup from `app-shell.tsx` unchanged, except that the grid becomes `grid-cols-4`. The raised Post button styling stays.
  - **No side** (`side === null`): render no nav, and a **Sign in** button in the header slot that opens the sheet through `useRequireAuth("Sign in to Zakbis")` with no side requirement.
  - **Loading** (`undefined`): render nothing.
  - `AppShell` stays a server component and renders `<TabBar active={active} />`.
- [ ] **Step 6:** Run `npm run lint`. Expected: no errors. Open `/` signed out: there's no tab bar and a Sign in button shows. Sign in as an existing account: the receiver tabs show.

### Task 3: Side step in sign-in

**Files:**
- Modify: `components/auth/sign-in-sheet.tsx`, `components/auth/use-require-auth.tsx`, `app/api/auth/telegram/route.ts`, `app/trips/[id]/request-form.tsx`, `app/post/post-request-form.tsx`, `app/traveler/verify/verify-flow.tsx`, `app/profile/profile-panel.tsx`

**Interfaces:**
- Consumes: `Side`, `homeFor`, `switchSide` (Task 2).
- Produces:
  - `SignInSheet({ …, onDone: (side: Side, isNew: boolean) => void })`, where `isNew` means the side was picked at the side step just now;
  - `useRequireAuth(heading: string, needs?: Side)`. When the sheet finishes, it applies these rules in order:
    1. `needs === side`: run the pending action;
    2. `needs` set but different: drop it and push the chosen side's start;
    3. no `needs`, with `isNew` and `side === "traveler"`: drop it and push `/traveler/verify`;
    4. otherwise: run the pending action.
  - **The chosen side's start:** `/traveler/verify` for a new traveler, otherwise `homeFor(side)`.

- [ ] **Step 1: Sign-in sheet.** `Step` gains `"side"`.
  - **`afterSignIn`:** a profile with `active_side` → `onDone(profile.active_side, false)`. Otherwise → step `"side"`, keeping the Telegram or Google fallback name for the name step.
  - **The reopen effect** goes to `"side"` (was `"name"`) when signed in.
  - **"I need items from abroad":**
    - if a profile row already has `first_name`, `switchSide("receiver")` then `onDone("receiver", true)`;
    - otherwise step `"name"`, where `saveName` upserts `{ id, first_name, active_side: "receiver" }` and calls `onDone("receiver", true)`.
  - **"I'm traveling to Addis":** upsert `{ id, active_side: "traveler" }`, then `onDone("traveler", true)`. An existing side calls `onDone(side, false)`.
- [ ] **Step 2: `useRequireAuth`.** "Already done" means `profile?.active_side` is set. If `needs` is set and the active side differs, `then` doesn't run. Pages with the wrong side are handled by `SideGate` in Task 4.
- [ ] **Step 3: Callers:**
  - `request-form.tsx` and `post-request-form.tsx` pass `"receiver"`;
  - `verify-flow.tsx` passes `"traveler"`, and its `load` treats `!profile?.active_side` as signed out;
  - in the Telegram route, `hasProfile` becomes `hasSide: !!profile?.active_side`.
- [ ] **Step 4:** Run `npm run lint`. Expected: no errors.
- [ ] **Step 5: Browser checks** (Review Focus 1 and 2), using a new email-code account:
  - closing at the side step and reopening shows the side step;
  - "Request this item", then "I'm traveling to Addis", lands on `/traveler/verify` with no success screen;
  - a new receiver gets the name step and then their request's success screen.

### Task 4: Side gate and traveler placeholder pages

**Files:**
- Create: `components/auth/side-gate.tsx`, `app/requests/page.tsx`, `app/trips/new/page.tsx`
- Modify: `app/post/page.tsx`, `app/trips/[id]/page.tsx` (around `RequestForm`), `app/traveler/verify/page.tsx`

**Interfaces:**
- Consumes: `useSide`, `switchSide`, `homeFor`.
- Produces: `SideGate({ side: Side; children })` (client).
  - **Signed out, or the active side equals `side`:** renders `children`.
  - **Otherwise:** renders the gate copy and a button that runs `switchSide(side)`. Switching to receiver with a null `first_name` sends the person to `/profile` to add a name first (see Task 5). It then refreshes.

- [ ] **Step 1: Implement `SideGate`, then wrap:**
  - the `/post` form (`"receiver"`);
  - the trip page's `RequestForm` (`"receiver"`);
  - `VerifyFlow` (`"traveler"`).
- [ ] **Step 2: Create the placeholder pages:**
  - `/requests`: `AppShell active="Requests"`, a `SideGate side="traveler"`, and the placeholder copy;
  - `/trips/new`: `AppShell active="Post"`, a `SideGate side="traveler"`. Inside it, `<VerificationStatus />` when not approved, else "Post a trip is coming soon." Use `loadMyVerification()`.
- [ ] **Step 3:** Run `npm run lint`. Expected: no errors. On the traveler side, opening `/post` shows "Switch to receiving to do this". Tapping the switch button shows the form and the receiver tabs.

### Task 5: Profile per side, with photos

**Files:**
- Create: `components/profile/photo-upload.tsx`, `lib/blur.ts`
- Modify: `app/profile/profile-panel.tsx`

**Interfaces:**
- Consumes: `useSide`, `switchSide`, `homeFor`, `VerificationStatus`, and `ImageUploadField` from `components/ui/image-uploader`.
- Produces:
  - `blurImage(file: File): Promise<Blob>`, which returns a JPEG made by a canvas downscale to about 24px wide, scaled back up with a blur filter (browser only);
  - `PhotoUpload({ side: Side })`, which uploads and saves the paths for that side and shows the current photo.

- [ ] **Step 1: `PhotoUpload`.**
  - **Receiver:** upload to `receiver-photos`, then update `receiver_photo_path`.
  - **Traveler:** upload the original to `photos` and `blurImage(file)` to `photos-blur`, then update `photo_path` and `photo_blur_path` in one `update`.
  - **Preview:**
    - receiver: the public URL of `receiver-photos`;
    - traveler: a signed URL from `photos`, since the owner can read their own.
  - **Errors** show through the field's existing error prop.
- [ ] **Step 2: Profile panel by side** (`useSide`).
  - **Header:** a "You're receiving" or "You're traveling" label above the side's block.
  - **Receiver block:** the existing first-name form (the save becomes an `update` only, since the row always exists now), then `PhotoUpload side="receiver"`, then **Switch to traveling**.
    - The switch runs `switchSide("traveler")`, then pushes to `/traveler/verify` if `loadMyVerification()` isn't approved, else `/requests`.
  - **Traveler block:**
    - the name, read-only, from the owner's `traveler_verifications.given_name` (approved: the "From your passport" hint; otherwise "Shown once you're verified");
    - `PhotoUpload side="traveler"`;
    - `VerificationStatus`;
    - **Switch to receiving.** With a null `first_name`, it shows the first-name form inline. Saving the name switches and pushes `/`. An empty name shows "Enter your first name".
  - **Shared, below both blocks:** sign-in methods, account ID, sign out (unchanged).
- [ ] **Step 3:** Run `npm run lint`. Expected: no errors.
- [ ] **Step 4: Browser checks** (Review Focus 3 and 5):
  - a traveler-first account, then "Switch to receiving": the name is asked for, and an empty name is refused;
  - a 9 MB image and a renamed PDF are refused before upload;
  - a valid photo on each side shows after reload, and the traveler `photos-blur` file is visibly blurred.

### Task 6: Given name in verification and admin review

**Files:**
- Modify: `app/traveler/verify/verify-flow.tsx`, `app/admin/verifications/review-list.tsx`

**Interfaces:**
- Consumes: `traveler_verifications.given_name` (Task 1).

- [ ] **Step 1: Verify flow.**
  - **Passport step:** a `givenName` field ("First name, as in your passport", `autoComplete="given-name"`, `maxLength={40}`) above the full name.
  - **Validation:** a trimmed length of 1 or more, else the constraint error copy.
  - **Wiring:** loaded from and saved to `given_name`, and shown in the summary.
- [ ] **Step 2: Review list.** Select `given_name`. Drop the `profiles.first_name` lookup and the `firstName` field. Show "First name (passport)", meaning `given_name`, under the legal name. Search matches `legal_name` and `given_name`.
- [ ] **Step 3:** Run `npm run lint` and `sh supabase/tests/run.sh`. Expected: no errors, all PASS. Submit a verification in the browser: the admin card shows the first name next to the passport photo.

### After the final review (not a task for the implementer)
- Apply `0005` to live Supabase via `psql "$DATABASE_URL"` after confirming the target.
- Fill `given_name` by hand for already-approved verifications. Ask the user for the value for their own account.
- Give the user the phone checklist.
