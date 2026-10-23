---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: []
---

# Browse Trips (app shell + trip list)

Scope: the app's mobile shell (header, bottom tab bar) and the Browse Trips list at `/`. Mode: Operate. The job: a receiver in Addis compares upcoming trips by origin, dates and free kg, then starts a request.

## Direction contract

THESIS: Each trip is a bag tag. Huge three-letter airport codes are the hierarchy, a green tag band says who's flying and how much room is left, and a perforated stub holds the deadline and the one action. This replaces the default stack of avatar cards, each with its own green button.

OWN-WORLD: Off-white ground #F6F8F7, white tag stock #FFFFFF with hairline #DDE4E0 edges, a Green / Brand #05DF72 tag band with near-black #14241D text, and Green / Text #076839 for the destination code and links. Inter, with weight 800–900 tabular caps for codes and 400–600 for UI text. Tags have asymmetric corners (16px top, 6px bottom) and notches on the perforation line. No eyelet: inside the band it read as a radio button.

STORY: The receiver sees right away who is flying from where, when they land, how much room is left and the last day to shop. They tap a tag to request an item.

FIRST VIEWPORT: Header on the ground (white is reserved for tag stock so tags stay the brightest objects) (wordmark left, location right). An h1 "Trips to Addis" with a count. Origin filter chips (All, USA, UK, China, Dubai). Then a vertical list of tags. Each tag has a band (traveler · kg free · deliveries or "New traveler"), a codes row (DXB → ADD at ~44px with city names under them), and a dashed perforation with side notches above a stub row (shop by · lands · "Request ›" in Green / Text). Bottom tab bar fixed.

FORM: Bag Tag, the IMPECCABLE’S PICK card (my grounded #1); the roll assigned Weyala Route Board. The decision page closed without a choice (its answer file defaulted to "assigned"); the user then chose in the fallback question, in their words: "Bag Tag (my pick)". seed:01c7a63b451a7d79

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
