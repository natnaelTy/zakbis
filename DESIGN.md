---
name: Zakbis
description: Shop abroad. Receive in Addis.
colors:
  brand-green: "#05DF72"
  brand-text: "#076839"
  green-tint: "#E6FBEF"
  ground: "#F6F8F7"
  tag-stock: "#FFFFFF"
  ink: "#14241D"
  slate-text: "#58665F"
  hairline: "#DDE4E0"
  mist: "#EEF2F0"
  amber-text: "#996500"
  amber-bg: "#FFF5DB"
typography:
  code:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.03em"
  wordmark:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 900
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-strong:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
  band:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.06em"
  ui:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.25
  tab:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  tag-bottom: "6px"
  lg: "12px"
  tag-top: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  chip:
    backgroundColor: "{colors.tag-stock}"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.ui}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
  trip-tag:
    backgroundColor: "{colors.tag-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag-top}"
  trip-tag-band:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.ink}"
    typography: "{typography.band}"
    padding: "10px 16px"
  nav-tab:
    textColor: "{colors.slate-text}"
    typography: "{typography.tab}"
  nav-tab-active:
    backgroundColor: "{colors.green-tint}"
    textColor: "{colors.brand-text}"
    rounded: "{rounded.full}"
---

# Design System: Zakbis

## Overview

**Creative North Star: "The Bag Tag"**

Zakbis borrows the airline baggage tag: white card stock, a bright green band printed across the top, country flags with the city names set big and bold, and a perforated stub that tears off. Every trip is one tag; the route is the hierarchy, the band says who is flying and how much room is left, and the stub holds the deadline and the single action. The rest of the interface steps back so the tags are the brightest objects on screen.

The world is light, cool and calm: an off-white green-grey ground, white reserved for tag stock, near-black green ink, and one loud green used only as a fill. Density is phone-first and generous enough for outdoor reading in bright sun; body text never drops below 16px. Inter carries everything, from 900-weight codes down to quiet 13px stub labels.

**Key Characteristics:**
- The route as the primary hierarchy: country flag above a semibold city name (Dubai → Addis Ababa). No airport codes on the card.
- Brand green as a band fill with near-black text, never as text.
- Asymmetric tag corners (16px top, 6px bottom) and a dashed tear line with side notches.
- Flat ground; only tags carry a faint shadow and lift on hover.
- One nav that is a bottom tab bar on phones and an inline pill row from md up.

## Colors

A cool off-white world with one saturated green, a darker green for text, and an amber reserved for warnings.

### Primary
- **Bag Tag Green** (brand-green): the tag band and primary button fills, plus text selection. Always carries Ink text on it.
- **Forest Text Green** (brand-text): every green that has to be read: the destination code, "Request" links, the active nav tab, focus rings and text carets.
- **Green Tint** (green-tint): the soft pill behind the active nav tab.

### Tertiary
- **Customs Amber** (amber-text on amber-bg): warnings and pending states only. It belongs to the pinned palette even though Browse Trips has no warning yet.

### Neutral
- **Ground** (ground): the page background, including the header and the tag notches, which are cut out to show the ground.
- **Tag Stock** (tag-stock): tag faces, chips and the phone tab bar.
- **Ink** (ink): primary text, text on green, and the fill of a selected chip.
- **Slate Text** (slate-text): secondary text, city names, stub labels, inactive tabs and icons.
- **Hairline** (hairline): every border, the dashed tear line and the notch outlines.
- **Mist** (mist): muted surfaces and the skeleton loading shimmer.

### Named Rules
**The Fill-Only Green Rule.** Bag Tag Green is a fill, never text. Text on it is always Ink, because white on it fails at 1.78:1. Green that has to be read uses Forest Text Green.

**The Brightest Object Rule.** White is for tag stock. Page chrome (header, page heading, filters row) sits on the Ground, so tags stay the brightest thing on screen.

## Typography

**Display Font:** Inter (with ui-sans-serif, system-ui)
**Body Font:** Inter (with ui-sans-serif, system-ui)

**Character:** A single workhorse grotesque stretched across its whole weight range: 900-weight, tightly tracked codes and wordmark read like airline print, while 400–600 UI text stays plain and warm.

### Hierarchy
- **Route** (600, 18px, line-height 1.375): the origin city on the trip tag. Long names wrap rather than truncate. The destination (always Addis Ababa) is 16px regular Slate Text.
- **Wordmark** (900, 20px, -0.03em): the lowercase "zakbis" in the header.
- **Headline** (700, 24px, -0.02em): page titles such as "Trips to Addis".
- **Body** (400, 16px, line-height 1.5): sentences and city names. 16px is the floor for reading text.
- **Body Strong** (600, 16px): dates in the stub, the "Request" action, empty-state titles.
- **Band** (600, 14px, 0.06em, uppercase): the traveler line inside the green tag band, printed like tag type.
- **UI** (500, 14px): chips, desktop nav, buttons, count lines next to a headline.
- **Label** (400, 13px): the small label above a value in the stub ("Shop by", "Lands"). Always paired with a 16px value.
- **Tab** (500, 12px): phone tab bar labels under 20px icons.

### Named Rules
**The Route Is the Hierarchy Rule.** On a trip, the flags and the city names lead. Nothing else on the tag competes with them.

## Layout

The layout is phone-first. Content sits in a centered column 448px wide on phones (max-w-md) that grows to 896px from the md breakpoint (768px), with 16px side gutters on phones and 24px on desktop. Trip tags stack in a single column with 12px gaps on phones and become a two-column grid with 16px gaps from md. The filter chip row scrolls sideways edge to edge on phones, without a scrollbar.

The phone tab bar is fixed to the bottom, padded for the safe area, and the column reserves 96px of bottom padding for it. Spacing uses a 4px base: 4, 8, 12, 16, 24. Use 12px and 16px inside tags and 24px between header items.

## Elevation & Depth

The system is mostly flat. The ground, the header and the chips carry no shadow and are separated only by hairline borders. Trip tags are the one lifted object: a barely-there resting shadow that deepens on hover while the tag rises 2px, over 200ms ease-out.

### Shadow Vocabulary
- **Tag rest** (`box-shadow: 0 1px 2px rgb(20 36 29 / 0.06)`): trip tags at rest.
- **Tag lift** (`box-shadow: 0 6px 16px rgb(20 36 29 / 0.10)`): trip tag on hover, paired with `translateY(-2px)`.

### Named Rules
**The Only Tags Lift Rule.** Shadows are tinted Ink and belong to tappable tags. Chrome and chips stay flat.

## Shapes

Rounded but purposeful. Pills (9999px) for chips and nav highlights, a gently curved 12px for buttons, and the signature asymmetric tag: 16px top corners and 6px bottom corners, like a tag's printed head and its torn stub. The tear line is a 2px dashed hairline with 20px semicircle notches at each edge, filled with the Ground so they read as cut-outs.

## Components

### Buttons
- **Shape:** gently curved (12px).
- **Primary:** Bag Tag Green fill, Ink text, UI type at weight 600, 10px × 20px padding. Use one per view, for the next step.
- **Focus:** a 2px Forest Text Green outline with a 2px offset (global focus-visible).

### Chips
- **Style:** a pill on Tag Stock with a hairline border, UI type, 6px × 16px.
- **State:** the selected chip inverts to an Ink fill with Ground text. Hover darkens the border to Ink at 30%.

### Navigation
- **Phone:** a five-tab bar fixed to the bottom, 64px tall, on translucent Tag Stock with a top hairline and the safe-area inset. Each tab has a 20px Lucide icon over a 12px label in Slate Text. The active tab turns Forest Text Green, its icon sits in a 48×28px Green Tint pill, and its stroke thickens from 1.75 to 2.25.
- **Post (phones):** a raised 48px Bag Tag Green circle (Ink plus icon, soft shadow, 4px Tag Stock ring) lifted 20px out of the bar's center, by the user's choice. **Post (desktop):** a regular nav pill like the others.
- **Sticky bars sit on the tab bar:** form send bars are fixed at exactly 65px (64px bar + hairline) above the bottom, with 16px bottom padding so the raised Post button never overlaps their button.
- **Desktop (md+):** the same nav moves inline into a sticky header (translucent Ground, backdrop blur, bottom hairline) as a row of pills: 16px icon beside a 14px label, with the active pill filled with Green Tint.
- **Header:** the logo mark (`zakbislogo.png` via next/image, 26px tall) with the lowercase "zakbis" wordmark on the left, and a location line (pin icon, "Addis Ababa") in Slate Text on the right.

### Trip Tag (signature)
The whole tag is one link with one action.
- **Stock:** Tag Stock, hairline border, 16px/6px corners, tag rest shadow.
- **Band:** a Bag Tag Green strip, 10px × 16px, with the uppercase traveler and free-kg line on the left and the delivery count or "New traveler" in UI type on the right.
- **Traveler in the band:** a 28px round traveler photo leads the band, before the caps label. A verified traveler gets the scalloped VerifiedBadge (`components/ui/verified-badge.tsx`, 16px, X-style blue with a white check, by user choice) right after the name; screen readers hear "Verified". It shimmers only on the single trip-page tag, is static in lists, and never animates under reduced motion. Hovering the photo shows a tooltip explaining the blur. The band's right side shows the rating in 14px: a filled Ink star, the rating in weight 600 and "· N reviews", or "New traveler" when there are no reviews. The star line is hidden from screen readers and replaced by "Rated 4.7 out of 5, 3 reviews".
- **Route row:** origin → destination. Each side is a 48×32px 3:2 SVG country flag (3px corners, Hairline ring, `aria-hidden`, never emoji) above the city name in Route type, with a muted plane icon between, flying toward Addis. The destination side is right-aligned and quiet: every trip ends in Addis, so its city is 16px regular Slate Text. The origin city leads.
- **Tear line:** a dashed 2px rule with notches cut out on both sides.
- **Stub:** "Shop by" and "Lands" as Label-over-Body-Strong pairs, then "Request ›" in Forest Text Green, pushed right. On hover the chevron nudges 2px right.
- **Accessibility:** one aria-label states the full trip, the rating and the action.

### Traveler Photo
- **Blur until matched:** the photo is blurred (`blur-md`, scaled 125% inside a circle that clips it) until the receiver's request is accepted, then shown sharp. It has `alt=""` and nothing depends on seeing it.
- **Say why it's blurred:** on the trip page, a 13px Slate Text caption with an eye-off icon under the tag reads "{name}'s photo is shown once your request is accepted."

### Form Controls
- **Fields** use shadcn `Field` / `FieldLabel` / `FieldError` / `FieldDescription` (via the shared `Field` in `components/request/item-fields.tsx`), with 16px semibold labels, 16px errors and 13px hints.
- **Currency** uses shadcn `Select` (Hairline border, card fill, 16px, theme tokens).
- **Dates** use shadcn `Popover` + `Calendar`: a field-styled trigger with a calendar icon showing "Fri 23 Oct 2026" or "Pick a date"; out-of-range days are disabled; day cells are 40px for phones.

### Reviews List (trip page)
- **Heading:** "Reviews" in 18px weight 700, with the rating summary in UI type on the right.
- **Item:** between hairline rules, the author's first name in Body Strong, a row of five stars, filled Ink up to the rating and Hairline after it (screen readers hear "Rated 5 out of 5"), and the date as a 13px Slate Text caption on the right, with the review text in Body below.
- **Empty:** one Body line in Slate Text saying the traveler has no reviews yet.
- **Sample data:** until reviews are real, the page states they are sample.

## Do's and Don'ts

### Do:
- **Do** put Ink (#14241D) text on every Bag Tag Green (#05DF72) fill.
- **Do** use Forest Text Green (#076839) for any green text, link or focus ring.
- **Do** keep reading text at 16px or larger. 13px is only for a label paired with a 16px value.
- **Do** keep page chrome on the Ground (#F6F8F7) and reserve white for tags.
- **Do** give each trip tag a single action (the whole tag links, and "Request ›" names it).

### Don't:
- **Don't** set white text on Bag Tag Green, or use Bag Tag Green as text.
- **Don't** add a per-card green button to trip tags. The stub's "Request ›" is the action.
- **Don't** put an eyelet or ring inside the green band. It read as a radio button and was removed.
- **Don't** add shadows to chrome, chips or the header. Only tags lift.
- **Don't** use Customs Amber for anything except warnings and pending states.
