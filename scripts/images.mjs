import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "images", "source");
const OUT = path.join(ROOT, "assets", "img");
const WIDTHS = [800, 1600, 2400];

const SLOTS = [
  "exterior-dusk",
  "exterior-portrait",
  "exterior-snow",
  "living",
  "kitchen",
  "dining",
  "bedroom",
  "bath",
  "spa",
  "detail-junction",
  "detail-textiles",
  "terrace",
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
