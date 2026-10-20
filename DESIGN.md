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

Zakbis borrows the airline baggage tag: white card stock, a bright green band printed across the top, three-letter airport codes set huge, and a perforated stub that tears off. Every trip is one tag; the codes are the hierarchy, the band says who is flying and how much room is left, and the stub holds the deadline and the single action. The rest of the interface steps back so the tags are the brightest objects on screen.

The world is light, cool and calm: an off-white green-grey ground, white reserved for tag stock, near-black green ink, and one loud green used only as a fill. Density is phone-first and generous enough for outdoor reading in bright sun; body text never drops below 16px. Inter carries everything, from 900-weight codes down to quiet 13px stub labels.

**Key Characteristics:**
- Huge black-weight airport codes (DXB → ADD) as the primary hierarchy.
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
- **Code** (900, 44px, line-height 1, -0.03em): IATA airport codes on the trip tag only. The destination code takes Forest Text Green.
- **Wordmark** (900, 20px, -0.03em): the lowercase "zakbis" in the header.
- **Headline** (700, 24px, -0.02em): page titles such as "Trips to Addis".
- **Body** (400, 16px, line-height 1.5): sentences and city names. 16px is the floor for reading text.
- **Body Strong** (600, 16px): dates in the stub, the "Request" action, empty-state titles.
- **Band** (600, 14px, 0.06em, uppercase): the traveler line inside the green tag band, printed like tag type.
- **UI** (500, 14px): chips, desktop nav, buttons, count lines next to a headline.
- **Label** (400, 13px): the small label above a value in the stub ("Shop by", "Lands"). Always paired with a 16px value.
- **Tab** (500, 12px): phone tab bar labels under 20px icons.

### Named Rules
**The Codes Are the Hierarchy Rule.** On a trip, the airport codes are the largest type. Nothing else on the tag competes with 44px black weight.

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
- **Phone:** a five-tab bar fixed to the bottom on Tag Stock with a top hairline. Each tab has a 20px Lucide icon over a 12px label in Slate Text. The active tab turns Forest Text Green, its icon sits in a 48×28px Green Tint pill, and its stroke thickens from 1.75 to 2.25.
- **Desktop (md+):** the same nav moves inline into the header as a row of pills: 16px icon beside a 14px label, with the active pill filled with Green Tint.
- **Header:** the lowercase wordmark on the left and a location line (pin icon, "Addis Ababa") in Slate Text on the right, all on the Ground.

### Trip Tag (signature)
The whole tag is one link with one action.
- **Stock:** Tag Stock, hairline border, 16px/6px corners, tag rest shadow.
- **Band:** a Bag Tag Green strip, 10px × 16px, with the uppercase traveler and free-kg line on the left and the delivery count or "New traveler" in UI type on the right.
- **Codes row:** origin code → destination code in Code type, with city names in 16px Slate Text underneath and a muted arrow between them. The destination code is Forest Text Green.
- **Tear line:** a dashed 2px rule with notches cut out on both sides.
- **Stub:** "Shop by" and "Lands" as Label-over-Body-Strong pairs, then "Request ›" in Forest Text Green, pushed right. On hover the chevron nudges 2px right.
- **Accessibility:** one aria-label states the full trip and the action.

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
