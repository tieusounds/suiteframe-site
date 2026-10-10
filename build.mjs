import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname);
const DIST = path.join(ROOT, "dist");

const SITE = "https://suiteframe.ch";
const OG_IMAGE = `${SITE}/assets/img/og-1200.jpg`;
const GA_MEASUREMENT_ID = (process.env.GA_MEASUREMENT_ID || "").trim();
const FORM_ACCESS_KEY = (process.env.FORM_ACCESS_KEY || "").trim();
const FORM_TO = "customer@suiteframe.ch";

// Keys whose values are already-safe markup and must not be HTML-escaped.
const RAW_KEYS = new Set([
  "jsonld",
  "ogLocaleAlternates",
  "langCurrentEn",
  "langCurrentDe",
  "langCurrentFr",
  "analytics",
  "analyticsScripts",
  "pageScripts",
  "consentBanner",
  "cookieSettingsLink",
  "demoMedia",
]);

// Prefer a committed site video; else pick up the airbnb-tours suiteframe-demo job output when present.
const DEMO_VIDEO_CANDIDATES = [
  path.join(ROOT, "assets", "video", "suiteframe-demo.mp4"),
  path.join(ROOT, "..", "airbnb-tours", "data", "suiteframe-demo", "preview_master.mp4"),
  path.join(ROOT, "..", "airbnb-tours", "data", "suiteframe-demo", "final_master.mp4"),
  path.join(ROOT, "..", "airbnb-tours", "data", "suiteframe-demo", "tour.mp4"),
];

async function resolveDemoVideo() {
  for (const candidate of DEMO_VIDEO_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function syncDemoVideo() {
  const found = await resolveDemoVideo();
  const destDir = path.join(ROOT, "assets", "video");
  const dest = path.join(destDir, "suiteframe-demo.mp4");
  await fs.mkdir(destDir, { recursive: true });
  if (!found) {
    console.log("demo video: placeholder (no suiteframe-demo.mp4 yet)");
    return false;
  }
  if (path.resolve(found) !== path.resolve(dest)) {
    await fs.copyFile(found, dest);
    console.log(`demo video: copied from ${found}`);
  } else {
    console.log("demo video: assets/video/suiteframe-demo.mp4");
  }
  return true;
}

function buildDemoMedia(assetPrefix, hasVideo, alt) {
  const poster = `${assetPrefix}assets/img/demo-poster-1600.jpg`;
  if (hasVideo) {
    return `<video
                class="demo__player"
                poster="${poster}"
                controls
                playsinline
                preload="metadata"
                aria-label="${escapeHtml(alt)}"
              >
                <source src="${assetPrefix}assets/video/suiteframe-demo.mp4" type="video/mp4" />
              </video>`;
  }
  return `<img src="${poster}" alt="${escapeHtml(alt)}" width="1600" height="900" loading="lazy" />
              <span class="demo__play" aria-hidden="true"></span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return "";
    return RAW_KEYS.has(key) ? String(data[key]) : escapeHtml(data[key]);
  });
}

function validGaId(id) {
  return /^G-[A-Z0-9]+$/i.test(id);
}

function buildAnalytics(locale, assetPrefix) {
  if (!validGaId(GA_MEASUREMENT_ID)) return "";
  const id = GA_MEASUREMENT_ID;
  return `<script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
        wait_for_update: 500
      });
      try {
        if (localStorage.getItem('sf_consent') === 'granted') {
          gtag('consent', 'update', { analytics_storage: 'granted' });
        }
      } catch (e) {}
      gtag('js', new Date());
      gtag('config', '${id}', {
        language: '${locale}',
        content_group: '${locale}',
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        anonymize_ip: true
      });
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`;
}

function buildAnalyticsScripts(assetPrefix) {
  if (!validGaId(GA_MEASUREMENT_ID)) return "";
  return `<script src="${assetPrefix}assets/consent.js" defer></script>
    <script src="${assetPrefix}assets/track.js" defer></script>`;
}

function buildFormConfigScript() {
  const payload = JSON.stringify({
    accessKey: FORM_ACCESS_KEY,
    to: FORM_TO,
  });
  return `<script>window.__SF_FORM__=${payload};</script>`;
}

function buildPageScripts(assetPrefix, { form = false } = {}) {
  const parts = [];
  if (form) {
    parts.push(buildFormConfigScript());
    parts.push(`<script src="${assetPrefix}assets/form.js" defer></script>`);
  }
  const analytics = buildAnalyticsScripts(assetPrefix);
  if (analytics) parts.push(analytics);
  return parts.join("\n    ");
}

function buildConsentBanner(strings) {
  if (!validGaId(GA_MEASUREMENT_ID)) return "";
  return `<aside id="consent-banner" class="consent" role="region" aria-label="${escapeHtml(strings.consent_label)}" hidden>
      <p class="consent__text">${escapeHtml(strings.consent_text)} <a href="${escapeHtml(strings.privacy_path)}">${escapeHtml(strings.privacy_link)}</a></p>
      <div class="consent__actions">
        <button type="button" class="consent__btn consent__btn--accept" data-consent="accept">${escapeHtml(strings.consent_accept)}</button>
        <button type="button" class="consent__btn consent__btn--decline" data-consent="decline">${escapeHtml(strings.consent_decline)}</button>
      </div>
    </aside>`;
}

function buildCookieSettingsLink(strings) {
  if (!validGaId(GA_MEASUREMENT_ID)) return "";
  return `<a href="#" data-consent-open>${escapeHtml(strings.cookie_settings)}</a>`;
}

function buildJsonLd(strings) {
  const url = `${SITE}${strings.path}`;
  const org = `${SITE}/#organization`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: "Suiteframe",
        url: `${SITE}/`,
        logo: `${SITE}/assets/brand/suiteframe-app-icon.png`,
        email: strings.email,
        areaServed: { "@type": "Country", name: "Switzerland" },
        knowsLanguage: ["en", "de", "fr"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE}/#website`,
        url: `${SITE}/`,
        name: "Suiteframe",
        inLanguage: strings.lang,
        publisher: { "@id": org },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: strings.title,
        description: strings.description,
        inLanguage: strings.lang,
        isPartOf: { "@id": `${SITE}/#website` },
        primaryImageOfPage: { "@type": "ImageObject", url: OG_IMAGE },
      },
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: strings.service_name,
        description: strings.description,
        provider: { "@id": org },
        areaServed: { "@type": "Country", name: "Switzerland" },
        offers: {
          "@type": "Offer",
          priceSpecification: {
            "@type": "PriceSpecification",
            priceCurrency: "CHF",
            minPrice: 500,
          },
        },
      },
    ],
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

await run("node", ["scripts/images.mjs"]);
const hasDemoVideo = await syncDemoVideo();

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });

const homeTemplate = await fs.readFile(path.join(ROOT, "src", "index.html"), "utf8");
const privacyTemplate = await fs.readFile(path.join(ROOT, "src", "privacy.html"), "utf8");
const locales = ["en", "de", "fr"];
const localeCodes = { en: "en_GB", de: "de_CH", fr: "fr_CH" };
const paths = { en: "/", de: "/de/", fr: "/fr/" };
const privacyPaths = { en: "/privacy/", de: "/de/privacy/", fr: "/fr/privacy/" };

if (GA_MEASUREMENT_ID && !validGaId(GA_MEASUREMENT_ID)) {
  console.warn(
    `GA_MEASUREMENT_ID="${GA_MEASUREMENT_ID}" is not a valid G- ID; analytics not injected.`
  );
} else if (validGaId(GA_MEASUREMENT_ID)) {
  console.log(`analytics: ${GA_MEASUREMENT_ID}`);
} else {
  console.log("analytics: off (set GA_MEASUREMENT_ID to enable)");
}

if (FORM_ACCESS_KEY) {
  console.log("quote form: Web3Forms");
} else {
  console.log("quote form: mailto fallback (set FORM_ACCESS_KEY for Web3Forms)");
}

for (const locale of locales) {
  const strings = JSON.parse(
    await fs.readFile(path.join(ROOT, "i18n", `${locale}.json`), "utf8")
  );
  const homeAssetPrefix = locale === "en" ? "/" : "../";
  const privacyAssetPrefix = locale === "en" ? "../" : "../../";
  const ogLocaleAlternates = locales
    .filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${localeCodes[l]}" />`)
    .join("\n    ");
  const shared = {
    ...strings,
    ogLocaleAlternates,
    langCurrentEn: locale === "en" ? 'aria-current="page"' : "",
    langCurrentDe: locale === "de" ? 'aria-current="page"' : "",
    langCurrentFr: locale === "fr" ? 'aria-current="page"' : "",
    consentBanner: buildConsentBanner(strings),
    cookieSettingsLink: buildCookieSettingsLink(strings),
  };

  const homeHtml = render(homeTemplate, {
    ...shared,
    assetPrefix: homeAssetPrefix,
    jsonld: buildJsonLd(strings),
    analytics: buildAnalytics(locale, homeAssetPrefix),
    analyticsScripts: "",
    pageScripts: buildPageScripts(homeAssetPrefix, { form: true }),
    demoMedia: buildDemoMedia(homeAssetPrefix, hasDemoVideo, strings.demo_video_alt),
  });

  const privacyHtml = render(privacyTemplate, {
    ...shared,
    assetPrefix: privacyAssetPrefix,
    analytics: buildAnalytics(locale, privacyAssetPrefix),
    analyticsScripts: "",
    pageScripts: buildPageScripts(privacyAssetPrefix, { form: false }),
  });

  if (locale === "en") {
    await fs.writeFile(path.join(DIST, "index.html"), homeHtml);
    await fs.mkdir(path.join(DIST, "privacy"), { recursive: true });
    await fs.writeFile(path.join(DIST, "privacy", "index.html"), privacyHtml);
  } else {
    const dir = path.join(DIST, locale);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), homeHtml);
    await fs.mkdir(path.join(dir, "privacy"), { recursive: true });
    await fs.writeFile(path.join(dir, "privacy", "index.html"), privacyHtml);
  }
}

await fs.mkdir(path.join(DIST, "assets"), { recursive: true });
await fs.copyFile(
  path.join(ROOT, "src", "styles.css"),
  path.join(DIST, "assets", "styles.css")
);
await fs.copyFile(
  path.join(ROOT, "src", "consent.js"),
  path.join(DIST, "assets", "consent.js")
);
await fs.copyFile(
  path.join(ROOT, "src", "track.js"),
  path.join(DIST, "assets", "track.js")
);
await fs.copyFile(
  path.join(ROOT, "src", "form.js"),
  path.join(DIST, "assets", "form.js")
);
await fs.copyFile(
  path.join(ROOT, "src", "trail.js"),
  path.join(DIST, "assets", "trail.js")
);
await fs.mkdir(path.join(DIST, "assets", "trail"), { recursive: true });
await fs.copyFile(
  path.join(ROOT, "src", "trail", "suiteframe-line-coordinates.json"),
  path.join(DIST, "assets", "trail", "suiteframe-line-coordinates.json")
);
await fs.copyFile(
  path.join(ROOT, "src", "trail", "suiteframe-line.svg"),
  path.join(DIST, "assets", "trail", "suiteframe-line.svg")
);
await fs.copyFile(
  path.join(ROOT, "src", "trail", "CURSOR-HANDOFF.md"),
  path.join(DIST, "assets", "trail", "CURSOR-HANDOFF.md")
);
await copyDir(path.join(ROOT, "assets", "fonts"), path.join(DIST, "assets", "fonts"));
await copyDir(path.join(ROOT, "assets", "img"), path.join(DIST, "assets", "img"));
await copyDir(path.join(ROOT, "assets", "brand"), path.join(DIST, "assets", "brand"));
await copyDir(path.join(ROOT, "assets", "trail-ink"), path.join(DIST, "assets", "trail-ink"));
if (hasDemoVideo) {
  await fs.mkdir(path.join(DIST, "assets", "video"), { recursive: true });
  await fs.copyFile(
    path.join(ROOT, "assets", "video", "suiteframe-demo.mp4"),
    path.join(DIST, "assets", "video", "suiteframe-demo.mp4")
  );
}

await fs.writeFile(
  path.join(DIST, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://suiteframe.ch/sitemap.xml\n"
);

const lastmod = new Date().toISOString().slice(0, 10);

function xhtmlAlternates(pathMap) {
  return [
    ...locales.map(
      (l) =>
        `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${pathMap[l]}"/>`
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pathMap.en}"/>`,
  ].join("\n");
}

const homeAlts = xhtmlAlternates(paths);
const privacyAlts = xhtmlAlternates(privacyPaths);
const urls = [
  ...locales.map(
    (l) => `  <url>
    <loc>${SITE}${paths[l]}</loc>
    <lastmod>${lastmod}</lastmod>
${homeAlts}
  </url>`
  ),
  ...locales.map(
    (l) => `  <url>
    <loc>${SITE}${privacyPaths[l]}</loc>
    <lastmod>${lastmod}</lastmod>
${privacyAlts}
  </url>`
  ),
].join("\n");

await fs.writeFile(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`
);
await fs.writeFile(
  path.join(DIST, "_redirects"),
  `# Render / Netlify-style
/index.html  /  200
`
);

console.log("built dist/");
