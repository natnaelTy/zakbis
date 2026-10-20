# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Travelers:** Ethiopian diaspora and other people flying into Addis Ababa from the USA, UK, China and Dubai. They have spare luggage space and want a reward, paid in ETB, for buying and carrying an item.
- **Receivers:** people in Addis Ababa who want an item from abroad. They usually browse on a phone, often on slow or expensive mobile data.
- **Admin:** the Zakbis operator. They confirm payment proofs, pay travelers out and maintain the exchange rates.

## Product Purpose
"Buy Me": a traveler posts a trip, and a receiver asks them to buy a specific item abroad and bring it. Receivers can also post open requests that any traveler can take. Success means a request completed end to end and paid out.

## Positioning
This is a structured, escrow-backed version of what already happens informally in Telegram and Facebook groups. The traveler buys a sealed item from a store and never carries a stranger's package. Money is held before anyone shops and released only when the receiver gives the traveler the handover code.

## Operating Context
- **Request states:** open → awaiting payment → paid → purchased → delivered → paid out (or cancelled).
- **Escrow is manual:** the receiver pays by Telebirr or bank transfer and uploads proof, an admin confirms it, and the admin pays the traveler out manually.
- **Exchange rate:** an admin-set rate is locked onto each request when it's created.
- **Phone numbers** are revealed to both sides only after payment. There is no in-app chat.
- **Handover** happens in Addis Ababa only.

## Capabilities and Constraints
- **Stack:** Next.js App Router with Supabase (database, login, file storage). The schema is in `supabase/migrations/0001_buy_me.sql`. Login is by phone number.
- **Shipped in English only.** Amharic comes later.
- **Out of scope:** the triangular sender/traveler/receiver flow, cities other than Addis, in-app chat, tracking, ratings, multi-item orders and insurance.
- **Still undecided:** service fee (flat or percentage), payout timeframe, and what "verified traveler" means.

## Brand Commitments
- **Name:** Zakbis. The user has a logo, but it's not yet in the repo.
- **Main brand color:** green.
- **Voice:** warm and plain. Short sentences and a community feel, with money and safety always stated precisely.

## Evidence on Hand
There are no real users, testimonials, delivery counts or ratings yet. Never make them up.

## Product Principles
1. Trust before transaction: say clearly who holds the money and when it moves.
2. Every price is shown in the item's currency and in ETB.
3. Design for a phone on slow data first.
4. Each screen has one obvious next step for the current request state.

## Accessibility & Inclusion
Text must be readable outdoors in bright sunlight on a phone. Meet WCAG AA contrast, and use body text of at least 16px.
