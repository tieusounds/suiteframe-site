import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "images", "source");
const OUT = path.join(ROOT, "assets", "img");
const WIDTHS = [800, 1600, 2400, 3840];

const SLOTS = [
  "exterior-dusk",
  "exterior-portrait",
  "exterior-snow",
  "living",
  "living-side",
  "kitchen",
  "dining",
  "hallway",
  "bedroom",
  "bath",
  "spa",
  "detail-junction",
  "detail-textiles",
  "terrace",
  // Suiteframe demo job (airbnb-tours/data/suiteframe-demo) — source stills + video poster
  "demo-01",
  "demo-02",
  "demo-03",
  "demo-04",
  "demo-05",
  "demo-06",
  "demo-poster",
];

async function findSource(slot) {
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const p = path.join(SRC, slot + ext);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function processSlot(slot) {
  const src = await findSource(slot);
  if (!src) {
    console.warn(`skip ${slot}: no source in images/source/`);
    return;
  }
  for (const w of WIDTHS) {
    const base = path.join(OUT, `${slot}-${w}`);
    const pipeline = () =>
      sharp(src)
        .rotate()
        .resize({ width: w, withoutEnlargement: true });
    await pipeline().avif({ quality: 62 }).toFile(base + ".avif");
    await pipeline().webp({ quality: 72 }).toFile(base + ".webp");
    await pipeline().jpeg({ quality: 78, mozjpeg: true }).toFile(base + ".jpg");
  }
  console.log(`ok ${slot}`);
}

await fs.mkdir(OUT, { recursive: true });
for (const slot of SLOTS) {
  await processSlot(slot);
}

// Social share card (1200x630): dusk exterior + brand wordmark.
async function buildOgImage() {
  const src = await findSource("exterior-dusk");
  if (!src) return;
  const logoPath = path.join(ROOT, "assets", "brand", "suiteframe-wordmark-light.png");
  const logo = await sharp(logoPath).resize({ width: 300 }).toBuffer();
  const shade = Buffer.from(
    `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.65"/>
      </linearGradient></defs>
      <rect width="1200" height="630" fill="url(#g)"/>
    </svg>`
  );
  await sharp(src)
    .rotate()
    .resize(1200, 630, { fit: "cover", position: "attention" })
    .composite([
      { input: shade },
      { input: logo, left: 64, top: 630 - 64 - 65 },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(OUT, "og-1200.jpg"));
  console.log("ok og-1200");
}
await buildOgImage();
