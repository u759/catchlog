# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One shared custom design on iOS and Android, both first-class (no primary OS). Adapt only platform affordances (navigation gestures and back behaviour, safe areas, system sheets/alerts, permission prompts, haptics), not the visual language.

## Users

Primarily the owner (Ayden) and his brother, plus friends: anglers in British Columbia logging catches at the lake. Typical scene: on the shore or in a boat, often with no signal, sometimes wet hands or gloves, bright sun. Sign-up is open, so other anglers can join.

## Product Purpose

A fishing catch log that works fully offline. Log a catch in seconds (photo, species, size, place, gear), keep it private or share with friends, and build a personal species collection. Success: logging at the lake is fast and never blocked by signal, and the app becomes the record you actually look back at.

## Positioning

Offline-first catch log backed by real public data rather than user-generated guesses: every BC lake's outline, depths, official depth-map PDFs and the fish recorded there (BC government open data), a species collection ("Dex") covering every fish in Canada (Wild Species 2020 + FishBase, Wikipedia/Commons), and conditions captured at catch time. Non-commercial hobby project: no ads, no subscriptions.

## Operating Context

- Logging: camera first → species (fuzzy search, lake species boosted, optional photo ID by Fishial.ai) → length/weight (weight estimated from FishBase length–weight formulas) → lure from the tackle box → save. Up to 6 photos per catch. Weather, moon/sun/solunar and the lake are attached automatically; tide, water temperature/level/flow and sea temperature are added by the server for the catch's own time and place.
- Offline: catches, photos, gear, spots, species, lakes and species-per-lake live on the phone (SQLite) and sync to Supabase when signal returns. Map areas (map + satellite) are saved for offline by the user.
- Social: friends via 8-character friend codes; per-catch visibility private / friends / public; leaderboard (online only).
- Screens: Logbook, Dex, Map (catch pins, saved spots, saved areas, satellite), Gear (tackle box with per-lure stats), species pages, lake pages, catch detail, profile, data sources.

## Capabilities and Constraints

- Expo / React Native, one codebase. Supabase only (no other backend services); offline-first sync of our own design.
- Units: user chooses Imperial or Metric; stored metric, converted for display.
- Region: BC data today; schema and data adapters are built to add other provinces.
- Data is refreshed automatically server-side; no manual maintenance is expected.
- Licences shape the product: FishBase CC BY-NC (non-commercial), EOX Sentinel-2 cloudless CC BY-NC-SA, OpenFreeMap tile limits, Wikimedia per-file credits shown on species pages, BC OGL attributions on the Data sources screen.
- Species ID from photos uses Fishial.ai's free plan (100 a month shared by everyone, capped per user). Knot/rig guide and region-scoped lake download are postponed.

## Brand Commitments

Name: CatchLog. App icon and splash assets exist in `assets/images/`. The brother's design explorations in `scratch/design-ref` are not to be used for design decisions.

## Evidence on Hand

Real data only: BC lakes, depths, depth maps and fish observations; Canadian species with FishBase facts and Wikipedia/Commons content; the owners' own catches. No testimonials, user counts, press, or ratings exist; do not invent them.

## Product Principles

1. The lake comes first: every core flow works with no signal, fast, one-handed.
2. Real data, credited: show public data faithfully with its source; never fake or guess links between datasets.
3. Your log is yours: each catch is private, friends-only or public, and sharing is a deliberate choice.
4. No maintenance: anything that changes over time updates itself.
5. Calm and useful over flashy: the app is a tool you use outdoors, not a feed.

## Accessibility & Inclusion

Outdoor use: legible in bright sun (strong contrast), large touch targets usable with wet hands or gloves, and respect for the OS text-size setting. No further standard has been set.
