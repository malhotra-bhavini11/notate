// Copies the pdf.js worker plus font/cmap/wasm/icc data into public/pdfjs so the
// PDF viewer can load them from this app (no CDN). Runs on install, dev and build;
// skips the copy when the installed pdfjs-dist version is already in place.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [
  path.join(root, "node_modules", "react-pdf", "node_modules", "pdfjs-dist"),
  path.join(root, "node_modules", "pdfjs-dist"),
];
const pdfjsDir = candidates.find((dir) => existsSync(path.join(dir, "package.json")));
if (!pdfjsDir) {
  console.warn("[pdfjs-assets] pdfjs-dist not installed; skipping");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(path.join(pdfjsDir, "package.json"), "utf8"));
const out = path.join(root, "public", "pdfjs");
const stamp = path.join(out, "VERSION");
if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version) process.exit(0);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(path.join(pdfjsDir, "build", "pdf.worker.min.mjs"), path.join(out, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const src = path.join(pdfjsDir, dir);
  if (existsSync(src)) cpSync(src, path.join(out, dir), { recursive: true });
}
writeFileSync(stamp, `${version}\n`);
console.log(`[pdfjs-assets] copied pdfjs-dist ${version} assets to public/pdfjs`);
