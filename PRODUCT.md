# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

static HTML/CSS with a small Node build (`build.mjs`) that renders EN/DE/FR pages into `dist/`; hosted as a Render static site on suiteframe.ch

## Users

Primary visitor: owners and managers of high-end stays (chalets, design houses, boutique properties) who already have listing photos and want a more cinematic way to show rooms. Job on this site: understand the offer in seconds and email to inquire.

## Product Purpose

Suiteframe makes cinematic room tours from the photos a host already has. The public site is a one-page landing that explains the offer, shows the mood of the work, states pricing, and routes contact to `customer@suiteframe.ch`.

## Positioning

Not a general video agency and not a booking site: room tours for houses worth the trip, made from existing listing photos, priced per property.

## Operating Context

Visitor arrives from direct URL or referral, scans the photographic page in EN / DE / FR, then emails. No account, no checkout, no analytics cookie banner.

## Capabilities and Constraints

- Languages: EN (default `/`), DE (`/de/`), FR (`/fr/`), static pages with `hreflang`
- Pricing line: "Priced per property. From CHF 500."
- Contact: `customer@suiteframe.ch`
- Brand assets live in `assets/brand/` (horizontal mark, on-dark, app icon); do not invent a substitute mark
- Imagery: synthetic Graubünden house set in `images/source/` — labeled as mood, not a client case study
- Open: Swiss Impressum (legal name + postal address) not yet provided

## Brand Commitments

- Name: Suiteframe
- Accent from brand green (~moss / forest from the mark)
- Voice: plain, specific, no "elevate"-style filler
- Binding assets: `assets/brand/suiteframe-horizontal.png`, `suiteframe-horizontal-on-dark.png`, `suiteframe-app-icon.png`

## Evidence on Hand

- Real brand PNGs in `assets/brand/`
- Mood photography in `images/source/` (not client work)
- No testimonials, case studies, or press — do not fabricate them

## Product Principles

1. The house image carries desire; type stays spare and legible.
2. One clear offer, one price line, one contact action.
3. Brand mark is sacred — use the files, never a redraw.
4. Three languages are first-class, not an afterthought.
5. Quiet luxury: no badges, no stat strips, no marketing clutter.

## Accessibility & Inclusion

Keyboard focus visible; contrast sufficient for nav and hero type over photography; respect `prefers-reduced-motion`; no cookie wall.
