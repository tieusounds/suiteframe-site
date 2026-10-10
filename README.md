# suiteframe.ch

Minimal luxury landing page for Suiteframe.

```bash
npm install
npm run build   # optimises images + writes dist/
npm run dev     # serve dist on :4173
```

Drop generated photos into `images/source/` using the names in `IMAGE_PROMPTS.md`, then run `npm run images` (or full `npm run build`).

## Quote form

The contact section collects name, email, phone, property address, and a listing/website URL.

Delivery uses [Web3Forms](https://web3forms.com) when `FORM_ACCESS_KEY` is set at build time (emails go to `customer@suiteframe.ch`). Without a key, submit opens a prefilled `mailto:` as a local fallback.

```bash
# 1. Create a free access key at https://web3forms.com (point it at customer@suiteframe.ch)
# 2. Build with the key:
FORM_ACCESS_KEY=your-access-key npm run build
```

On Render, set `FORM_ACCESS_KEY` in the service Environment and redeploy.

## Analytics (GA4)

Build injects Google Analytics 4 only when `GA_MEASUREMENT_ID` is set (format `G-XXXXXXXXXX`). Local builds leave it unset so dev traffic never pollutes the property.

```bash
# Production-like local build
GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run build
npm run dev
```

On Render, set `GA_MEASUREMENT_ID` in the service Environment (see `render.yaml`). Redeploy after changing it — the ID is baked in at build time.

Behaviour:

- Consent Mode v2 defaults to `analytics_storage: denied`
- Non-blocking Accept / Decline bar (EN / DE / FR); choice in `localStorage` (`sf_consent`)
- Events: `cta_click`, `email_click`, `quote_request`, `lang_switch`, `scroll_depth`, `section_view`, `gallery_image_view`, `engaged_30s`
- Privacy copy at `/privacy/`, `/de/privacy/`, `/fr/privacy/`

Manual GA4 admin steps: data retention 2 months, Google Signals off, ads signals off, mark `email_click` as a key event, then verify in DebugView after accepting cookies.
