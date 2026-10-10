import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname);
const DIST = path.join(ROOT, "dist");

function render(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? String(data[key]) : ""
  );
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

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });

const template = await fs.readFile(path.join(ROOT, "src", "index.html"), "utf8");
const locales = ["en", "de", "fr"];

for (const locale of locales) {
  const strings = JSON.parse(
    await fs.readFile(path.join(ROOT, "i18n", `${locale}.json`), "utf8")
  );
  const assetPrefix = locale === "en" ? "/" : "../";
  const html = render(template, {
    ...strings,
    assetPrefix,
    langCurrentEn: locale === "en" ? 'aria-current="page"' : "",
    langCurrentDe: locale === "de" ? 'aria-current="page"' : "",
    langCurrentFr: locale === "fr" ? 'aria-current="page"' : "",
  });
  if (locale === "en") {
    await fs.writeFile(path.join(DIST, "index.html"), html);
  } else {
    const dir = path.join(DIST, locale);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), html);
  }
}

await fs.mkdir(path.join(DIST, "assets"), { recursive: true });
await fs.copyFile(
  path.join(ROOT, "src", "styles.css"),
  path.join(DIST, "assets", "styles.css")
);
await copyDir(path.join(ROOT, "assets", "fonts"), path.join(DIST, "assets", "fonts"));
await copyDir(path.join(ROOT, "assets", "img"), path.join(DIST, "assets", "img"));
await copyDir(path.join(ROOT, "assets", "brand"), path.join(DIST, "assets", "brand"));

await fs.writeFile(
  path.join(DIST, "robots.txt"),
  "User-agent: *\nAllow: /\nSitemap: https://suiteframe.ch/sitemap.xml\n"
);
await fs.writeFile(
  path.join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://suiteframe.ch/</loc></url>
  <url><loc>https://suiteframe.ch/de/</loc></url>
  <url><loc>https://suiteframe.ch/fr/</loc></url>
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
