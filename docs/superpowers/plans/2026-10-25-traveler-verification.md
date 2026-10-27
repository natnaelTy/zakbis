# Traveler Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Travelers verify once (passport, selfie, payout account), an admin approves or revokes them, and only verified travelers' trips, offers and trip requests are possible.

**Architecture:**
- **Migration `0003`:** adds `traveler_verifications`, a private `identity` bucket, and one rule `is_verified_traveler(uid)`, which the trips policy, `make_offer`, `accept_offer`, the trip-request trigger and `traveler_stats.verified` all reuse.
- **UI:**
  - `/traveler/verify`: a step-by-step client page;
  - `/admin/verifications`: an admin-only page with Pending and Approved tabs;
  - a status block on Profile.

**Tech Stack:** Next.js 16.2, React 19, Supabase (Postgres RLS, Storage, `@supabase/ssr`), shadcn base-nova components, the existing SQL test harness (`sh supabase/tests/run.sh`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-25-traveler-verification-design.md`

## Global Constraints

- **Verified:** `is_verified_traveler(uid)` = `profiles.verified` and the verification's `passport_expiry >= addis_today()`. Never re-implement this check anywhere else.
- **Owner writes:**
  - insert and update on `traveler_verifications` force `status = 'pending'`, clear `rejection_reason`, `decided_at` and `decided_by`, set `submitted_at = now()`, and set `profiles.verified = false`;
  - allowed only while the row is absent, rejected, or approved with an expired passport.
- **`decide_verification(p_user uuid, p_approve boolean, p_reason text default null)`:**
  - admin-only;
  - a reason is required when rejecting;
  - it works on pending **and** approved rows (revoke).
- **Visibility:** trips are listed publicly only when `shop_by >= addis_today()` and `is_verified_traveler(traveler_id)`. The owner, admins and receivers who have a request on the trip can always read it.
- **Requests already underway** (awaiting payment or later) are never blocked by a change in verification.
- **The `identity` bucket:**
  - private, 8 MB limit, `image/jpeg`, `image/png` and `image/webp` only;
  - insert only under `<uid>/`;
  - readable by the owner and admins;
  - no delete policy.
- **Exact copy:**
  - Intro: "So receivers know who's carrying their item. Only Zakbis staff see your documents."
  - Pending: "We're checking your documents. You can prepare trips, but they'll stay hidden until you're approved."
  - Approved: "You're a verified traveler."
  - Rejected: the reason, plus **Fix and resubmit**.
  - Profile entry: **Become a traveler**.
- **Rejection reasons:** "Photo unclear", "Name doesn't match", "Passport expired", "Selfie doesn't match", or "Other" (with free text).
- **Look and feel:** follow `DESIGN.md` (16px body text, green fills only for actions). Reads use explicit columns.
- **Commits:** only if the user asks. Applying `0003` to Supabase is covered by plan approval.

## Review Focus

1. **A self-approval attempt:** an owner inserting or updating with `status = 'approved'`, or updating `profiles.verified` directly, ends up pending or unverified. → Task 1 tests.
2. **An approved traveler with a valid passport resubmits** to escape an earlier decision: refused. With an expired passport: allowed, and the status goes back to pending. → Task 1 tests.
3. **A revoked traveler with a request already paid** can still move it to purchased. New offers and trip requests to them are refused. → Task 1 tests.
4. **An identity file that's too large, or not an image,** is refused by the bucket. The uploader also shows an error before uploading. → Task 2 browser check (file over 8 MB).
5. **A non-admin** opening `/admin/verifications` gets a 404, and calling `decide_verification` raises. → Task 1 test and Task 3 check.

---

### Task 1: Migration 0003 and its tests

**Files:**
- Create: `supabase/migrations/0003_traveler_verification.sql`, `supabase/tests/verification_test.sql`
- Modify:
  - `supabase/tests/stubs.sql`: give `storage.buckets` the columns `file_size_limit bigint` and `allowed_mime_types text[]`, and add the test helper `public.test_verify(uid uuid)`, created **after** the migrations by `run.sh` (see below);
  - `supabase/tests/run.sh`: after the migrations, apply `supabase/tests/helpers.sql`;
  - existing tests that list trips, make offers or request on trips: call `select test_verify('<traveler uuid>')` in their seed section.
- Create: `supabase/tests/helpers.sql`, which defines `test_verify(uid)`: it upserts an approved `traveler_verifications` row with expiry today + 1 year and sets `profiles.verified = true`, as superuser.

**Interfaces:**
- **Produces:**
  - the table `traveler_verifications(user_id uuid pk references profiles on delete cascade, legal_name text not null, nationality text not null check (nationality ~ '^[A-Z]{2}$'), passport_expiry date not null, passport_path text not null, selfie_path text not null, status text not null default 'pending' check in ('pending','approved','rejected'), rejection_reason text, submitted_at timestamptz, decided_at timestamptz, decided_by uuid)`;
  - `is_verified_traveler(uid uuid) returns boolean` (security definer, stable);
  - `decide_verification(p_user uuid, p_approve boolean, p_reason text default null) returns void`;
  - `traveler_stats` with the column `verified boolean` appended;
  - the bucket `identity`.
- **Modifies** (`create or replace`, carrying over the full 0001 bodies, plus):
  - **`make_offer`:** raises `'only verified travelers can offer'` unless `is_verified_traveler(uid)`;
  - **`accept_offer`:** raises `'this traveler is not verified'` unless `is_verified_traveler(o.traveler_id)`;
  - **`requests_before_insert`:** for `kind = 'trip'`, raises `'this traveler is not verified'` unless `is_verified_traveler(new.traveler_id)`;
  - **the `trips` select policy:** dropped and recreated as in the Global Constraints.

- [ ] **Step 1: Write `verification_test.sql`**, with these assertions:
  - **Self-approval:** the owner inserts a row with `status = 'approved'`, which gives `status = 'pending'`, and `profiles.verified` is false.
  - **Owner can't set verified:** an owner `update profiles set verified = true` raises (no column grant).
  - **Visibility:** anon can't see a pending traveler's trip. The traveler sees it, and an admin sees it.
  - **Admin-only decisions:**
    - a non-admin calling `decide_verification` raises `admins only`;
    - an admin approving makes anon see the trip, and `traveler_stats.verified` is true.
  - **Resubmitting:**
    - an approved owner with a valid passport updating their row raises;
    - after setting `passport_expiry` to yesterday (as superuser), the trip is hidden from anon and `traveler_stats.verified` is false;
    - an owner update is then allowed and gives pending.
  - **Rejecting:**
    - an admin rejecting without a reason raises;
    - with `'Photo unclear'` it gives `status = 'rejected'`, the reason is stored, and the owner can update again.
  - **Unverified travelers can't do new business:**
    - with T unverified, `make_offer` raises `only verified travelers can offer`;
    - a trip request on T's trip raises `not verified`.
  - **Revoking keeps deals going:** with T verified, a request is accepted and paid. Then the admin revokes T (`decide_verification(T, false, 'Other')`), and T can still move it to `purchased`. The receiver can still read that trip.
  - **Identity files:**
    - the owner uploads `identity/<T>/p.jpg`, which is allowed;
    - uploading under another user's folder raises;
    - a stranger selecting `identity` objects gets 0 rows, while an admin gets 1.
- [ ] **Step 2:** Run `sh supabase/tests/run.sh`. Expected: `FAIL verification_test.sql`. The other files may fail too, until their seeds call `test_verify`.
- [ ] **Step 3:** Write the migration and the helpers, and update the earlier tests' seeds.
- [ ] **Step 4:** Run `sh supabase/tests/run.sh`. Expected: every file PASS (8 files plus harness).
- [ ] **Step 5: Mutation check.** Remove the expiry condition from `is_verified_traveler`. Expected: `verification_test` FAILS. Then restore it.
- [ ] **Step 6:** Apply to Supabase with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0003_traveler_verification.sql`. Then check that `select id, public, file_size_limit from storage.buckets where id = 'identity'` gives `identity|f|8388608`.

### Task 2: Onboarding page and status on Profile

**Files:**
- Create:
  - `app/traveler/verify/page.tsx`, a server component wrapping `AppShell active="Profile"`;
  - `app/traveler/verify/verify-flow.tsx`, a client component;
  - `components/traveler/verification-status.tsx`.
- Modify: `app/profile/profile-panel.tsx`, to render `<VerificationStatus />` above "Ways to sign in".

**Interfaces:**
- **Consumes:** the Task 1 table and bucket, `useRequireAuth`, `ImageUploadField`, `Field`, `Input`, `Select` and `Calendar`/`Popover` (the same pattern as the needed-by picker).
- **Produces:**
  - `VerificationStatus()`, which reads its own row (`select status, rejection_reason`) and renders:
    - **no row:** "Become a traveler", linking to `/traveler/verify`;
    - **pending, approved or rejected:** the copy from the Global Constraints, with "Fix and resubmit" linking to `/traveler/verify` when rejected.
  - `/traveler/verify`:
    - **signed out:** opens the sign-in sheet (heading "Sign in to become a traveler");
    - **signed in:** the 5 steps from the spec (intro, passport, selfie, payout, review);
    - **already approved with a valid passport:** shows the approved status instead.

- [ ] **Step 1: Build the flow.**
  - **Uploads:** `supabase.storage.from("identity").upload(`${uid}/passport-${Date.now()}.${ext}`, file)` and the same for the selfie. The selfie input uses `capture="user"`.
  - **Submit:** upsert `traveler_verifications` (with the user id), then upsert `payout_accounts`.
  - **Nationality:** a `Select` of ISO codes, with Ethiopia (`ET`) first, then US, GB, CN, AE, CA, DE, SE, NO, IT, SA, IL, then the rest alphabetically.
  - **Expiry:** must be after today, or show "This passport has expired".
  - **Files:** over 8 MB or not an image show the uploader's existing errors.
  - **Rejected:** prefill the earlier fields (the images must be uploaded again).
- [ ] **Step 2:** Run `npm run lint && npm run build`. Expected: passes, and `/traveler/verify` is listed.
- [ ] **Step 3: Browser check** with playwright-cli on localhost:3000 at 390×844, as a test user signed in through the signed-Telegram helper used in the login work (Telegram id 6):
  - Profile shows **Become a traveler**;
  - complete the steps with small test JPEGs, and expiry today + 2 years;
  - a 9 MB image is refused with an error;
  - after submitting, Profile shows the pending copy;
  - the database has 1 pending row and 2 objects in `identity/<uid>/`.

  Delete the test user afterwards; its rows cascade, and its storage objects are deleted via SQL.

### Task 3: Admin review page

**Files:**
- Create:
  - `app/admin/verifications/page.tsx`, a server page: `notFound()` unless `rpc('is_admin')` is true;
  - `app/admin/verifications/review-list.tsx`, a client component.

**Interfaces:**
- **Consumes:** `decide_verification`, `traveler_verifications` (admins read all; add the policy in Task 1 if it's missing), `payout_accounts` (admins read) and `profiles(first_name)`.
- **Produces:** the **Pending** tab (oldest first) and the **Approved** tab (with a name search). Each card shows:
  - side-by-side images (`createSignedUrl` with 300 s expiry);
  - legal name, nationality, expiry and first name;
  - when submitted;
  - the payout method, account name and number.

  Actions: **Approve**; **Reject** (a reason select plus optional text); **Revoke** on the Approved tab (same reasons).

- [ ] **Step 1:** Build it. Desktop-first layout inside `AppShell active="Profile"`; usable at 390 wide.
- [ ] **Step 2:** Run `npm run lint && npm run build`. Expected: passes.
- [ ] **Step 3: Browser check:**
  - as a non-admin test user, `/admin/verifications` returns 404;
  - make a second test user an admin (`update profiles set is_admin = true` via SQL), use the Task 2 flow to create a pending traveler, approve them, and check that the row is approved and `traveler_stats.verified` is true;
  - revoke them, and check that `verified` is false;
  - screenshot `.impeccable/review/admin-verifications.png`;
  - delete both test users.

### Task 4: Hand over to the user

- [ ] **Step 1:** Give the user the exact SQL to make their own account an admin. They'll sign in at `app.zakbis.com` and look up their user id on Profile. Give it as:
  `update profiles set is_admin = true where id = '<their user id>';`
  Add a small "Your account ID" line (copyable) on Profile, so they can find it.
- [ ] **Step 2:** Ask whether to commit, and hand the user a short phone checklist: become a traveler, then approve themselves on the admin page.
