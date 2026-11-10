---
name: CatchLog
description: Offline-first fishing log for BC anglers, built on real lake and species data.
colors:
  forest: "#1C3A2E"
  forest-pressed: "#14291F"
  on-forest: "#FFFFFF"
  paper: "#F4F5F0"
  surface: "#FFFFFF"
  surface-sunken: "#EEF1EA"
  ink: "#15201A"
  ink-muted: "#5C665F"
  hairline: "#E3E7E0"
  outline: "#CDD3C9"
  lime: "#D8E9A8"
  on-lime: "#2F4A14"
  spot-gold: "#F6E7C8"
  on-spot-gold: "#9A6B12"
  danger: "#B3261E"
typography:
  large-title:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  secondary:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
  caption:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
  stat:
    fontFamily: "System (SF Pro / Roboto)"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tnum"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.on-forest}"
    typography: "{typography.headline}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 24px"
  button-primary-pressed:
    backgroundColor: "{colors.forest-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.md}"
    height: "52px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 16px"
  chip-selected:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.on-forest}"
  segmented:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "48px"
  list-group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "48px"
---

# Design System: CatchLog

## Overview

**Creative North Star: "The Tackle Box"**

Practical and organised: everything has a labelled place, controls are sturdy enough for wet hands, and nothing is there for decoration. The page is plain paper; content sits directly on it in clear sections. The only things that get a raised, framed surface are things you can pick up as a unit (a catch, a species, a lake, a saved area) or a group of rows that belong together.

Colour comes from the content, not the chrome: catch photos, species art, the map and satellite imagery. The interface itself is forest ink on warm paper with one tint for anything you can press. Density is moderate: generous touch targets, short lines of text, one lead element per screen (the photo, the fish, the lake, the map), everything else quieter.

The app is used outdoors in sun, often with gloves. Contrast and target size are not polish; they are the job.

**Key Characteristics:**
- One lead per screen; supporting facts as quiet text and grouped rows, never a grid of equal tiles.
- Flat. No drop shadows except controls floating over the map.
- System font only, seven text roles, three weights (400, 600, 700). Sentence case everywhere.
- Forest is the only interactive colour; lime only marks a personal highlight.

## Colors

Calm, outdoorsy and nearly monochrome: deep forest on warm off-white, with a single pale-lime highlight.

### Primary
- **Forest** (#1C3A2E): every interactive thing that is "on": primary buttons, selected chips and segments, the active tab, links, icons that act. Also the stat numerals' accent where a value is the point.
- **Forest, pressed** (#14291F): pressed state of primary buttons.

### Secondary
- **Lime** (#D8E9A8) with **Deep Moss** text (#2F4A14): personal highlights only: a new species, a personal best, the catch count on a Dex card you've caught.
- **Spot Gold** (#F6E7C8) with **Ochre** (#9A6B12): saved fishing spots on the map and spot-related labels. Nothing else.

### Neutral
- **Paper** (#F4F5F0): the page background on every screen.
- **Surface** (#FFFFFF): grouped rows, tappable unit cards, inputs.
- **Sunken** (#EEF1EA): secondary button fill, segmented-control track, image placeholders.
- **Ink** (#15201A): primary text (15.3:1 on Paper).
- **Ink, muted** (#5C665F): secondary text, units, captions (5.4:1 on Paper, 5.2:1 on Sunken).
- **Hairline** (#E3E7E0): dividers between rows and around sections.
- **Outline** (#CDD3C9): the edge of inputs and unselected chips.
- **Danger** (#B3261E): destructive actions and errors only.

### Named Rules
**The One Tint Rule.** Forest is the only colour that means "you can press this" or "this is selected". Never use lime, gold or grey fills to signal a button.

**The Highlight Rule.** Lime appears only where something is personally notable (new species, PB). It is never a button, a disabled state, an icon background or a panel for ordinary facts.

**The Sun Rule.** Body and secondary text stay at or above 4.5:1 against whatever they sit on. Muted is #5C665F, never lighter.

## Typography

**Display Font:** System (SF Pro on iOS, Roboto on Android)
**Body Font:** System
**Character:** The phone's own voice: native, legible at any text size, invisible. Hierarchy comes from size and weight, not from typefaces or capitals.

### Hierarchy
- **Large title** (700, 30px, 1.2): the name of a top-level tab screen (Logbook, Dex, Map, Gear). One per screen.
- **Title** (700, 22px, 1.25): the subject of a detail screen (Rainbow Trout, Lac Le Jeune, the catch's species).
- **Headline** (600, 17px, 1.3): section headings, button labels, row titles that lead.
- **Body** (400, 16px, 1.4): paragraphs, row labels, input text.
- **Secondary** (400, 14px, 1.35, Ink muted): supporting lines under titles, row subtitles, attribution.
- **Caption** (500, 13px, 1.3, Ink muted): field labels, units, metadata. Sentence case.
- **Stat** (700, 22px, tabular numerals): the one number that matters in a row (length, weight, count).

### Named Rules
**The Seven Roles Rule.** Every text uses one of the seven roles above, through the theme. No hand-picked font sizes in screens; no weight 800.

**The No-Shouting Rule.** No uppercase labels with letter-spacing. Labels are sentence-case captions.

## Layout

Single column, 16px side margins, content flowing on Paper. Sections are separated by 24px of space and introduced by a Headline; related rows inside a section sit in one Surface group with hairline dividers. Stack spacing follows 4 / 8 / 12 / 16 / 24 / 32. Lists that grow page in as you scroll. Primary actions sit within thumb reach: pinned to the bottom of forms, and logging lives in the tab bar.

Headers come in three kinds and only three:
- **Top-level (tabs):** Large title on the left; leaderboard and profile buttons on the right.
- **Detail (pushed screens):** back button on the left. Utility screens (Profile, Leaderboard, Data sources, Saved areas) add an inline Headline title; subject screens (a species, a lake, a catch) leave it empty and show the subject's name as the Title in the content.
- **Modal (forms):** close on the left, centred Headline title, optional action on the right; the primary action is pinned at the bottom.

## Elevation & Depth

Flat. Depth is shown by placement on Paper versus Surface, and by hairlines, not shadows.

### Shadow Vocabulary
- **Map float** (`shadowColor #000, opacity 0.12, radius 10, offset 0 3`): only for buttons and bars floating over the map or satellite imagery, where they must separate from busy pixels.

### Named Rules
**The Flat-By-Default Rule.** No shadows on cards, tiles, sections or buttons. If something needs separating, give it Surface and a hairline.

## Shapes

Gently rounded and consistent: 12px for buttons, inputs and segmented controls; 16px for Surface groups and unit cards; full pill for chips. Photos get 12px corners. Circles only for avatars and the map's round buttons and the camera tab.

## Components

### Buttons
- **Shape:** gently rounded (12px), 52px tall, full width in forms.
- **Primary:** Forest fill, white Headline label, optional leading icon. One per screen.
- **Secondary:** Sunken fill, Ink label. For the second action (Take photo vs Library, Cancel).
- **Text:** Forest label, no fill. For tertiary actions (Sign out, Data sources).
- **Disabled:** the same button at 40% opacity. Never recoloured.

### Chips
- **Style:** Surface fill, Outline edge, Ink label (600, 15px), 40px tall pill (44px touch area).
- **State:** selected chips fill Forest with white label. Chips filter or pick; for 2–3 mutually exclusive settings use the segmented control.

### Segmented control
Sunken track, 40px tall, 12px corners; the selected segment is a Surface pill with an Ink label (600, 15px), unselected labels Ink muted. Labels shrink to fit at large text sizes. Used for the Logbook filter, Dex scope, Units, leaderboard period, catch visibility, the map's date range and Map / Satellite.

### Lists and groups
Surface group, 16px corners, rows ≥ 48px with a Body label, Secondary subtitle, and right-aligned value or chevron; hairline dividers inset 16px. Used for settings, catch facts, lake facts, data sources, saved areas.

### Unit cards
A catch, a species or a saved area as one tappable thing: Surface, 16px corners, no shadow. Image first, then Headline name and a Secondary line.

### Inputs / Fields
Caption label above, Surface field with Outline edge, 12px corners, 48px tall, Body text, unit as a Caption suffix. Focus: Forest edge.

### Navigation
Bottom tab bar with four sections (Logbook, Dex, Map, Gear) and the camera action in the centre as a Forest circle (44px) without a label. Active tab: Forest icon and label; inactive: Ink muted.

### Badge
Lime pill with Deep Moss caption text (600): "Personal best", "Caught 3×", a Dex card's catch count. The only place lime appears.

### Facts line
Several values as one Secondary line joined by " · " ("0.91 kg · 11.2 cm · Lake tahoe · Yesterday"). Replaces stat tiles.

### Sheet
A bottom sheet for a small, self-contained choice: Paper background, 20px top corners, Headline title with a close button, content in Segmented controls and Groups. The dimmed backdrop fades in place; only the panel slides up (280ms ease-out in, 200ms ease-in out). With Reduce Motion the panel fades instead. Used for map layers.

### Dropdown
A filter choice that stays in context: the button shows the current value with a chevron (Forest fill when a filter is active); the menu opens directly under it as a Surface card with 48px rows and a check on the selected row, fading and settling in 160ms. No backdrop dimming; tapping outside closes it. Used for the map's species filter.

### Tip
A one-time hint on Surface with a hairline edge: Secondary text and a Forest "Got it". Dismissed tips stay dismissed on the phone. One tip per screen at most.

### Map controls
Map floats sit over imagery with the Map float shadow. Top: one Surface panel holding the date-range Segmented control and the species Dropdown. Bottom-left: the Forest "Save area" pill. Bottom-right: Layers (opens the Map sheet: Map / Satellite, Saved areas, Save an area) above Locate. Everything stays clear of the map attribution in the bottom corners. Lakes we have data for get a faint Forest outline (the 300 biggest lakes in view at any zoom; zooming in reveals smaller ones) (white on satellite) and a 5% tint so they read as tappable; one tap opens the lake. Taps resolve in order: catch pins, saved spots, then the smallest lake under the finger. Long-press still saves a spot.

### Empty states
Icon in a Sunken circle, Headline title, Secondary explanation, then one action.

## Do's and Don'ts

### Do:
- **Do** give every screen one lead (photo, fish, lake, map) and keep everything else in Body/Secondary text or grouped rows.
- **Do** write numbers as one quiet line when there are several ("0.91 kg · 11.2 cm · 7:42 PM").
- **Do** use the theme's text roles and colours; screens should not contain raw sizes or hex values.
- **Do** keep touch targets at least 44×44pt (48dp on Android).
- **Do** credit data sources in a Secondary line next to the data.

### Don't:
- **Don't** put boxes inside boxes, or show a row of equal stat tiles.
- **Don't** add drop shadows outside the map.
- **Don't** use uppercase letter-spaced labels or weight 800.
- **Don't** use lime for buttons, disabled states or ordinary panels.
- **Don't** show a stat that is zero just to fill a tile ("Your catches 0").
- **Don't** use web patterns: breadcrumbs, underlined links, hover hints.
- **Don't** write filler copy. Say what something does or what happened, in plain words, once.
