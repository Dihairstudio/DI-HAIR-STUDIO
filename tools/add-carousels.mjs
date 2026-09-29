/* One-shot codemod (safe to re-run): marks the photo grids on the sub pages as
   scroll carousels. The pages are single-line HTML, so the containers are
   matched by their exact class+id pair instead of by line. js/main.js wraps any
   [data-carousel] grid in the arrow controls and turns it into a native
   scroll-snap carousel — no markup restructuring needed. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  ['pages/services.html', '<div class="catalog-grid" id="catalogGrid">', 'Katalog layanan DI HAIR'],
  ['pages/packages.html', '<div class="pkg-grid" id="pkgGrid">', 'Paket layanan DI HAIR'],
  ['pages/products.html', '<div class="product-grid" id="prodGrid">', 'Produk DI HAIR'],
  ['pages/our-work.html', '<div class="gallery-row" id="allGallery"', 'Galeri hasil kerja DI HAIR'],
  ['pages/artists.html', '<div class="artist-row" id="rev"', 'Artist DI HAIR STUDIO REV'],
  ['pages/artists.html', '<div class="artist-row" id="joca"', 'Artist DI HAIR STUDIO JOCA'],
  ['pages/locations.html', '<div class="location-row" id="locations">', 'Lokasi DI HAIR'],
  ['pages/academy.html', '<div id="acadGrid" class="pkg-grid">', 'Program DI HAIR Academy']
];

for (const [file, needle, label] of targets) {
  const path = join(ROOT, file);
  let html = readFileSync(path, 'utf8');
  if (html.includes(needle + '> data-carousel') || html.includes(needle.replace(/>$/, '') + ' data-carousel')) {
    console.log(`skip ${file}  (already marked)`);
    continue;
  }
  if (!html.includes(needle)) { console.log(`MISS ${file}  ${needle}`); continue; }
  const attr = ` data-carousel data-carousel-label="${label}"`;
  html = html.replace(needle, needle.endsWith('>') ? needle.slice(0, -1) + attr + '>' : needle + attr);
  writeFileSync(path, html);
  console.log(`ok   ${file}  ->  ${label}`);
}
