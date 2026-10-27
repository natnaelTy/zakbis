# Profile page redesign: design

## Intent
Today's Profile is one long, flat stack with no header: name, photo, verification, a switch button, sign-in methods, the account ID and Sign out, all with the same weight. The user finds it disorganized and unattractive from top to bottom. The goal is a settings-style page where the person sees who they are and which side they're on at a glance, and everything else sits one tap away.

**Reference (user-supplied):** the Pairdel app's Account screen. It has a big "Account" title, a two-option segmented toggle (Shopper | Traveller), a profile row (avatar or initial, name, "Edit profile" link, chevron), and a list of icon + label + chevron rows.

## Decided by the user
- **Follow the reference's structure.** In order:
  1. a big **"Account"** title;
  2. a **Receiving | Traveling** segmented toggle;
  3. a **profile row**: photo or first initial, name, "Edit profile", chevron;
  4. a **list of rows** with icons and chevrons.
- **The toggle replaces the "Switch to…" button** and behaves the same way:
  - Traveling, when not verified, opens verification.
  - Receiving, with no receiver name, asks for the name first.
- **Rows:**
  - **Both sides:** Ways to sign in.
  - **Traveler side only:** Verification (with its status), Payout method.
  - **At the bottom:** Help & support, then **Sign out** in red.
- **Help & support** opens an email to the support address, which the user will provide later.
- **The account ID is removed.**
- **Address, Transactions and Disputes** from the reference are left out until those features exist.

## Goals
- **Two things at a glance:** the active side and who you are, the moment the page opens.
- **One tap:** every setting is one tap from the main page.
- **Looks like Zakbis:** it follows `DESIGN.md` (Inter, ink, brand green for actions, hairline dividers, 16px body) and the reference's calm, list-based layout. It's not a copy of Pairdel's colors or fonts.

## Non-goals
- New features. Every row leads to something that exists today, apart from the payout editor, which edits the existing `payout_accounts` row.
- Database changes. None are expected.
- Desktop-specific layout. The page stays in the existing centred column (`md:max-w-xl`).

## Anti-goals
- Losing any current capability:
  - editing the receiver name;
  - each side's photo;
  - the traveler name shown read-only from the passport;
  - the verification status and its "Fix and resubmit" path;
  - connecting Telegram, Google and email;
  - signing out.
- A toggle that switches sides without the existing guards: verification for traveling, a name for receiving.

## How it works (my calls unless marked above)

### Main page `/profile`
- **Signed out:** the "Account" title, a short line and a **Sign in** button, as today.
- **Signed in:**
  1. **Title** "Account", the headline style.
  2. **Segmented toggle** with Receiving and Traveling.
     - The active side is a filled pill (brand green, ink text). The other is plain on the mist background.
     - Tapping the inactive side runs today's `switchTo` logic, and the toggle follows the active side.
  3. **Profile row**, the whole row a link to `/profile/edit`:
     - the side's photo, or a green-tint circle with the first initial (or a person icon when there's no name yet);
     - the side's name: the receiver `first_name`, or the traveler's approved passport first name, or "Not verified yet";
     - "Edit profile" in brand-text green, and a chevron.
  4. **A hairline divider, then the rows**, each a full-width tappable row with icon, label, optional right-side status text and chevron, separated by hairlines:
     - **Traveler only, Verification** → `/profile/verification`. The right-side status reads:
       - nothing, when it hasn't started;
       - "Checking", while pending;
       - "Verified" (green), when approved with a valid passport;
       - "Action needed" (red), when rejected;
       - "Passport expired" (red), when approved but the passport has expired.
     - **Traveler only, Payout method** → `/profile/payout`. The right side shows "Telebirr" or the bank name when one is set.
     - **Ways to sign in** → `/profile/sign-in`.
     - **Help & support** → `mailto:` the support address. The address comes from `NEXT_PUBLIC_SUPPORT_EMAIL`. When that's unset, the row is hidden.
     - **Sign out**, in destructive red with no chevron, after a gap.
- **Icons** come from lucide (already installed): `IdCard` or `BadgeCheck` for Verification, `Wallet` for Payout, `KeyRound` for Ways to sign in, `LifeBuoy` for Help, `LogOut` for Sign out.

### Sub-pages
Each sub-page has a back link "← Account" in the existing trip-page back-link style, a title, and its content. All of them sit inside `AppShell active="Profile"`.
- **`/profile/edit` (Edit profile)** shows the active side's fields: today's name form and photo upload, moved here.
  - **Receiver:** an editable first name, plus the receiver photo.
  - **Traveler:** the name read-only with "From your passport" (or "Shown once you're verified"), plus the traveler photo.
- **`/profile/verification` (Verification):** today's `VerificationStatus` card, which already shows the rejection reason with **Fix and resubmit**, "Become a traveler" when not started, and the pending and verified messages. An expired passport is treated like "not started": the copy says the passport has expired, with a link to `/traveler/verify` (my call). This keeps pending travelers off the submission form, so they can't submit twice.
- **`/profile/sign-in` (Ways to sign in):** today's Telegram, Google and email cards, moved here unchanged.
- **`/profile/payout` (Payout method):** a form for Telebirr, or a bank with account name and number, the same fields and checks as verification step 4. It writes the caller's `payout_accounts` row, which the owner policy already allows. Saving shows "Saved".
  - Changing payout details doesn't send the traveler back for verification (my call: it isn't identity).
  - The builder may reuse the payout fields from `verify-flow.tsx`, extracting them if that keeps the code smaller.

### The toggle's guards (unchanged logic)
- **Switching to Receiving with no receiver name** opens the name prompt inline under the toggle: "Add the first name travelers will see". Saving it switches sides. This is today's `askName` flow, in a new place.
- **Switching to Traveling** pushes `/traveler/verify` when not approved, or approved with an expired passport. Otherwise it stays on Account with the traveler rows shown.
- **Switching to Receiving,** including "Save" in the name prompt, also stays on Account.
- **This is a change:** today the switches jump to `/requests` and `/`. On the Account page, staying put is expected (my call). Switching anywhere else (`SideGate`) is unchanged.
- **Signed in but no side yet** (the sheet was closed before the side question): neither pill is filled, and tapping one runs the guards above. The profile row shows a person icon with "Choose how you'll use Zakbis" and no link. Only Ways to sign in, Help and Sign out are listed (my call).
- **Payout method before verification:** allowed. The row is shown on the traveler side whatever the verification status. Payouts are only paid after delivery, which needs verification anyway (my call).

## Left to the builder
- How the components split (for example a `ProfileRow` / `SettingsRow` helper), and exact spacing, matching `DESIGN.md`.
- Whether the payout form is extracted from `verify-flow.tsx` or written fresh.
- Loading states. They follow the existing pattern ("Loading…", or skeletons).
- **Tests:** there are no component tests in the project. Typecheck, build, and a browser walk-through of every row and both toggle guards.
