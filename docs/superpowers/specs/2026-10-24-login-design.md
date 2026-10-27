# Login (Telegram + email): design

This is piece 2 of 3 in connecting Zakbis to Supabase. Piece 1, the database, is live. Piece 3 makes the forms save. The phone check (an SMS code through AfroMessage) moves to the piece that builds the payment and landing screens, because the AfroMessage sender name needs a paid account (decided by the user).

## Intent
Let receivers and travelers sign in with almost no friction, only at the moment they act, so browsing stays open to everyone. Most users in Ethiopia live in Telegram, so Telegram is the main way in, and email is the fallback.

## Decided by the user
- **Methods:** Telegram (main) or email with a 6-digit code, for receivers and travelers alike. No SMS or phone login.
- **When:** browsing trips, reviews and open requests needs no login. Login is asked for only when someone takes an action: **Send request**, **Post request**, and later **Offer**.
- **Linking (decided by the user):** one person can connect both methods to a single account, so switching devices never splits their requests and reviews.
- **Never shown to other users:** Telegram usernames and email addresses. Phone numbers are the only contact detail, revealed later by the database rules.
- **Accounts in place:**
  - the bot @ZakbisBot, with its domain set to `app.zakbis.com`;
  - Resend, verified for `zakbis.com` and connected as Supabase's mail server, sending from `login@zakbis.com`, with the email template set to send a code;
  - the app on `app.zakbis.com`, deployed from the `develop` branch.
- **Secrets** are in `.env` and in Vercel: `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY`. The public settings `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are in both too; `app.zakbis.com` already uses them.

## Goals
- From tapping an action to being signed in: one tap with Telegram, or email plus code. Nothing the user typed into the form is lost.
- A profile row exists for every signed-in user before any write, because the database's `profiles` table needs a first name.
- Sessions survive reloads and work in server components.

## Non-goals (this piece)
- Saving the forms to the database (piece 3). After login, the forms still show today's success screen.
- The phone check and the payout account (with the payment and landing screens).
- Admin login screens. Admins are normal users with `is_admin` set in the database.

## Experience (my calls unless marked above)
1. **Opening the sheet:** when a logged-out user submits a valid form, a **sign-in sheet** opens over the form (a bottom sheet on phones, a centered dialog on desktop). The form stays mounted underneath, so nothing is lost. The sheet shows:
   - the heading "Sign in to send your request" (or "…to post your request");
   - the **Telegram button** (the official Telegram Login Widget for @ZakbisBot);
   - a divider "or";
   - an **email field** with "Email me a code".
2. **Email:** after "Email me a code", the sheet shows six digit boxes ("We sent a code to m…@gmail.com"), a **Resend code** link (available after 60 seconds) and **Use a different email**. A correct code signs the user in. Wrong or expired codes show inline errors.
3. **First sign-in:**
   - **Name:** the sheet asks for a **first name** only ("What should travelers call you?"). For Telegram users it's prefilled from Telegram's first name, and they can edit it.
   - **Photo:** the Telegram profile photo is **not** imported (privacy; photos are their own later step).
   - **Profile:** saving creates the `profiles` row.
4. **After signing in:** the sheet closes and the original action continues automatically. For now that's the existing success screen.
5. **Already signed in:** the action goes straight through, with no sheet.
6. **The Profile tab (`/profile`):** a minimal page showing the first name (editable), the connected sign-in methods (visible only to you) and **Sign out**. Logged out, it shows the same sign-in options. A fuller profile comes later.
7. **Linking, on `/profile`:**
   - **Signed in with Telegram, no email yet:** "Add an email" → enter an email → a 6-digit code is sent there → after entering it, that email signs into this same account.
   - **Signed in with email, no Telegram yet:** "Connect Telegram" (the Telegram widget) → after confirming in Telegram, Telegram sign-in opens this same account.
   - **Already taken:** if the email or the Telegram account already belongs to a different Zakbis account, show "This email / Telegram already has its own Zakbis account. Sign in with it instead." Merging two existing accounts is out of scope (my call).

## How it works (my calls)
- **Sessions:** use `@supabase/ssr`, which is already installed, with a browser client, a server client and a `proxy.ts` (Next 16's name for middleware) that refreshes the session cookie on each request. The public key is used everywhere except the Telegram route.
- **Email:** addresses ending in `@users.zakbis.com` are refused, since they're the internal Telegram ones. Then `signInWithOtp({ email, options: { shouldCreateUser: true } })`, then `verifyOtp({ email, token, type: 'email' })`. Supabase sends the code through Resend.
- **Telegram:** Supabase has no built-in Telegram login, so:
  1. **The widget** calls back in the page with Telegram's signed user data.
  2. **The browser** posts that data to `POST /api/auth/telegram`.
  3. **The route checks it:**
     - the signature is valid: HMAC-SHA256 over the sorted `key=value` fields, keyed with SHA-256 of `TELEGRAM_BOT_TOKEN`, compared in constant time;
     - `auth_date` is less than 24 hours old.

     It refuses anything else.
  4. **Account:** using the service-role key on the server only, it looks up the Telegram id in a new `telegram_links` table and creates the Supabase user if the id isn't there. The user gets an internal email `tg-<telegram id>@users.zakbis.com`, which is never mailed and never shown, marked confirmed, with the Telegram id stored in the user's `app_metadata`, which users can't edit.
  5. **Session:** it creates a one-time sign-in link for that user (`admin.generateLink`, type `magiclink`), immediately exchanges it on the server with `verifyOtp({ token_hash, type: 'magiclink' })`, and sets the session cookies.
  6. **Response:** it returns `{ isNew, firstName }` so the sheet knows whether to ask for a name.
- **`telegram_links` table** (new migration `0002_telegram_links.sql`): `telegram_id bigint primary key` and `user_id uuid unique references auth.users on delete cascade`. Row-level security is on with no policies, so only the service-role key (the Telegram routes) can read or write it. It's the reliable way to find "which account is this Telegram user" (Supabase can't search users by metadata).
- **Connect Telegram:** `POST /api/auth/telegram/link`, which needs a signed-in session. It verifies the Telegram data the same way, refuses if that Telegram id is already in `telegram_links`, then inserts `(telegram_id, current user)`.
- **Add an email:** `supabase.auth.updateUser({ email })`, which sends a code through the **Change Email Address** template, then `verifyOtp({ email, token, type: 'email_change' })`. The internal `tg-…@users.zakbis.com` address is replaced by the real one. The error when the email is already used by another account maps to the "already taken" message.
- **Profile row:** the name step appears whenever the signed-in user has **no `profiles` row**, whether or not they're new, so someone who closed the sheet early is asked again (my call). The row is created by the browser after sign-in (`insert into profiles (id, first_name)`), which the database rules allow for one's own id. Check for it with a column-limited select: `select id, first_name`, never `*`, because some profile columns are private even to their owner.
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` and `TELEGRAM_BOT_TOKEN` are read only in the Telegram route, server-side, and are never sent to the browser.

## Dashboard settings the user changes (Supabase → Authentication)
- **Change Email Address template:** subject `Your Zakbis code: {{ .Token }}`, with the code in the body, like the login email.
- **Secure email change: OFF.** When it's on, Supabase also asks the *old* address to confirm. A Telegram user's old address is the internal one, which can't receive mail, so adding an email would never complete. With it off, only the new address confirms. The trade-off is small: someone who already has your session could change your email (my call).

## Constraints
- **Look and feel:** follow `DESIGN.md` and `PRODUCT.md`: 16px body text, green fills only for real actions, and the existing `Field`, `Input` and `Button` components. Add the sheet or dialog with shadcn's `dialog`/`sheet` component (base-nova style, per `components.json`; none exists yet). Fix the CLI's `"cn"` import and remove the stray `cn` package if it adds them again.
- **Telegram widget:** loaded from `telegram.org` only when the sheet opens, which keeps phones on slow data fast.
- **Accessibility:** the sheet traps focus and closes on Esc, and the code boxes are one accessible input group.
- **Local development:** Telegram login works only on `app.zakbis.com`, as BotFather allows only that domain, so on localhost the Telegram button shows a note and email login is used.

## Testing
- **Automated:** a node test for the Telegram signature check, with a known-good payload signed with a test token, a tampered field, and an old `auth_date`. A SQL test for `telegram_links`: no access for `anon` or `authenticated`, and `telegram_id` unique.
- **Manual on `app.zakbis.com`:**
  - Telegram sign-in from Send request, including a first sign-in that asks for the name;
  - email sign-in with a real inbox;
  - sign out;
  - Telegram user adds an email, then signs in by email into the same account;
  - email user connects Telegram, then signs in by Telegram into the same account;
  - linking a Telegram account that already has its own account is refused;
  - signing in mid-form keeps the typed values.

## Left to the builder
File layout, component names, sheet visuals within DESIGN.md, and the exact copy beyond what's quoted.

## Follow-ups
- Phone check (AfroMessage, once upgraded) on the payment and landing screens.
- Profile photos (a blurred copy plus the private original).
- Piece 3: saving the forms.
