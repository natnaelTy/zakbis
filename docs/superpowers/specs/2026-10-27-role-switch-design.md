# Traveler and receiver sides: design

This piece comes before "Post a trip with ticket checks", whose Post button depends on knowing which side is active.

## Intent
Zakbis has two very different users: travelers, who carry items into Addis, and receivers, who order them. Each should see an app built for what they're doing, not a mix of both. One person can be both, for example someone in Dubai who also orders for family, but never at the same moment. So one login holds **two sides with a switch between them**, like Uber's rider and driver modes.

This replaces "One account type" in the traveler verification design (2026-10-25). Traveler verification now belongs to the traveler side only.

## Decided by the user
- **Role-based app:** the tabs and actions depend on the active side.
- **One login, two sides:** a single Telegram, Google or email login holds a traveler side and a receiver side. Only one is active at a time, and you switch between them.
- **Separate profiles:** each side has its own name, its own photo and its own reviews. Traveler reviews never mix with receiver reviews.
- **Traveler name:** locked to the verified passport. Receivers see the **first name only**, as on today's trip card.
- **Receiver name:** chosen freely.
- **Photos:** both sides upload any photo they like. The traveler photo does not have to be the verification selfie.
- **Admin is not a side.** Admin moves to its own subdomain with separate admin-only accounts later, as its own piece. This piece leaves `/admin/*` and `profiles.is_admin` as they are.

## Goals
- **Uncluttered:** a receiver never sees traveler actions, and a traveler never sees receiver actions.
- **Quick switch:** switching takes one tap from Profile, and the app remembers the last side on every device.
- **Trustworthy names:** a traveler's public name always comes from their checked passport.

## Non-goals
- Requests, trips and offers saving for real (later pieces).
- Moving admin to the subdomain (its own piece).
- Notifications.
- **Server checks on the active side.** Both sides belong to the same person, and the database already blocks someone requesting on their own trip. The side is a display choice, not a security boundary (my call).

## Anti-goals
- **Leaking legal names.** Exposing a traveler's full passport name or legal surname anywhere public. Only the first name is shown.
- **Blurring the sides.** Showing receiver activity on someone's traveler profile, or the other way round.

## How it works (my calls unless marked above)

### First sign-in
After the login step (unchanged), a new account sees one question: **"I'm traveling to Addis"** or **"I need items from abroad"**.
- **Receiver:** asks for a first name, as sign-in does today, then continues the action that opened sign-in, if there was one.
- **Traveler:** asks for no name, since it will come from the passport, and goes to `/traveler/verify`.

The other side is set up the first time they switch to it:
- switching to receiver asks for a name;
- switching to traveler starts verification.

**Signed-out visitors** (user's decision): there's **no tab bar**. They see the Trips list, browsable, with trip links still opening, plus a **Sign in** button in the header. The tabs appear once they're signed in and have a side.

**Every new account gets the side question** (user's decision), including when sign-in was opened by a receiver action such as "Request this item". If they pick **traveler** there, the pending action is dropped and they go to `/traveler/verify`.

### Switching
- Profile has one button: **"Switch to traveling"** or **"Switch to receiving"**.
- Switching saves the active side to the account and returns to that side's first tab.
- A small label on Profile shows which side you're on.

### Tabs
| Receiver side | Traveler side |
|---|---|
| Trips (`/`) | Requests (`/requests`: open requests to offer on) |
| Post: post an open request (`/post`) | Post: post a trip. Until that piece ships, it opens the verification status, or "Post a trip is coming soon" once verified. |
| Activity | Activity |
| Profile | Profile |

Pages that belong to the other side stay reachable by direct link, but they show "Switch to traveling/receiving to do this" with the switch button, instead of the form.

### Profiles
- **Receiver profile:** first name (editable on Profile) and photo.
- **Traveler profile:**
  - **Name:** a new **given name** field on `traveler_verifications`, typed by the traveler in the passport step ("First name, as in your passport") and checked by the admin on the review card next to the passport photo. It's shown read-only on Profile with "From your passport". We don't use the first word of `legal_name`, because many passports put the surname first and that would publish it (my call).
  - **Before approval:** the traveler has no public name, and nothing of theirs is listed anyway.
  - **Photo:** their own upload.
- **Photo upload (both sides):** JPEG, PNG or WebP, up to 8 MB, the same limits as verification.
  - **Traveler photo:** blurred until a request is accepted, then real. This is how the schema already works: `photo_blur_path` and `photo_path` are revealed by `can_see_photo()`. The builder chooses how to make the blur (for example, a canvas downscale in the browser).
  - **Receiver photo:** clear from the start for travelers (user's decision). It's one public image with no blurred copy.
  - **Kept apart:** the receiver photo is stored where revealing a traveler's photos can never expose it, and the other way round. For example, it goes in a separate public bucket or folder, outside `photos/<uid>/` (my call).
- **Reviews:** these are already separate. `traveler_stats` counts reviews of someone as a traveler, and `receiver_stats` counts reviews of them as a receiver. No change is needed.

### Data
- **One `profiles` row per login stays.**
  - The existing `first_name` becomes the receiver name.
  - The existing `photo_blur_path` and `photo_path` stay the traveler photo, so `can_see_photo()` is unchanged.
- **New columns on `profiles`:**
  - `active_side`, either `'receiver'` or `'traveler'`;
  - `receiver_photo_path` (public).
- **`first_name` becomes nullable,** because a traveler-first account has no receiver name. Null means "receiver side not set up".
  - Anything that needs a receiver, such as making a request, requires it to be set.
  - Code that treats "has a profile row" as "finished sign-in" now checks for "has an active side" instead (`use-require-auth`, `sign-in-sheet`, the Telegram route).
- **Public traveler name:** exposed through a column-safe view or function that returns only the approved `given_name`. `traveler_verifications` stays private.
- **The admin review list** currently shows `first_name`. It switches to the legal name it already displays.
- **Existing verifications:** `given_name` is required on new submissions. Existing approved rows get it filled in by hand, since there are only test accounts and the user's own.
- **Existing accounts:** only test accounts and the user's own. Set `active_side = 'receiver'` for all of them. Anyone with an approved verification can switch to traveling.

## Left to the builder
- Where `active_side` is read: a client hook next to `useRequireAuth` versus the server (pages are client components today).
- How to make the blur image, and exact copy and styling, matching the existing screens.
- Test shape. Follow the existing `supabase/tests` pattern for the database, including a test that the public traveler-name view never returns more than the first name.
