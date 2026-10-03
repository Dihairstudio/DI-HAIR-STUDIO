/* Route the hand-written card templates in pages/*.html through picTag().

   Why: index.html, pages/products.html and pages/packages.html already render
   their cards with the main.js helpers (cardProduct/cardPackage/picTag), so
   they get the right crop box, a 1.6x srcset candidate, the per-photo focal
   point and the DIHAIR.photoSubstitute remap. Seven other pages still built
   their own <img src="${...}"> from the raw data URL: no crop box (so a
   portrait photo filled a landscape card and cut the subject), no srcset, no
   focal point, and a 404 upstream would stay broken. This pass swaps those
   seven templates for the same helper the other pages use.

   Idempotent: each replacement is skipped when the file no longer contains the
   old snippet (already converted or copy changed). The verification pass at the
   end fails the run if any raw template <img> survived. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* [file, old snippet, new snippet, card part] */
const edits = [
  /* academy cards live in a .pkg-image wrapper -> same part as packages ----- */
  ['pages/academy.html',
    '<img src="${a.image}" alt="${a.title}" loading="lazy">',
    "${picTag(a.image, 'pkg', a.title)}"],
  /* artist portraits: tall crop, 72vw on mobile (see PIC.artist) ----------- */
  /* capped pages need the *Page crop tiers (their cards are max-width:1240px) */
  ['pages/artists.html',
    '<img src="${x.image}" alt="${x.name}" loading="lazy">',
    "${picTag(x.image, 'artistPage', x.name)}"],
  /* franchise page uses string concatenation, not a template literal ------- */
  ['pages/franchise.html',
    '<img src="+f.image+" alt="+f.name+" loading=lazy>',
    "\"+picTag(f.image,'pkg',f.name)+\""],
  /* branch photos: wide crop, 2-up on tablet+ (see PIC.location) ----------- */
  ['pages/locations.html',
    '<img src="${x.image}" alt="${x.name}" loading="lazy">',
    "${picTag(x.image, 'location', x.name)}"],
  /* filterable gallery: portrait-ish crop for the masonry cards ------------ */
  ['pages/our-work.html',
    '<img src="${im}" alt="${t}" loading="lazy">',
    "${picTag(im, 'galleryPage', t)}"],
  /* program cards are a 2-col grid on desktop -> 50vw wide crop ------------ */
  ['pages/program.html',
    '<img src="${p.image}" alt="${p.title}" loading="lazy">',
    "${picTag(p.image, 'story', p.title)}"],
  /* catalog rows are [name, desc, category, image] tuples ------------------ */
  ['pages/services.html',
    '<img src="${x[3]}" alt="${x[0]}" loading="lazy">',
    "${picTag(x[3], 'catalog', x[0])}"],
];

let changed = 0;
for (const [file, from, to] of edits) {
  const path = join(ROOT, file);
  const text = readFileSync(path, 'utf8');
  const hits = text.split(from).length - 1;
  if (!hits) { console.log(`-  ${file}: snippet not found (already applied?)`); continue; }
  writeFileSync(path, text.split(from).join(to));
  console.log(`ok ${file}: ${hits} template <img> -> picTag()`);
  changed += hits;
}
console.log(`${changed} template image(s) converted`);

/* ---- verify: no page may build an <img> from a raw data URL ------------- */
const pages = ['index.html', ...['academy', 'about', 'artists', 'collaboration', 'franchise',
  'locations', 'our-work', 'packages', 'products', 'program', 'promo', 'services']
  .map(n => `pages/${n}.html`)];
const raw = /<img[^>]*src=(?:"\$\{|\s*"\+|"\$\{?x\[)/g;
let bad = 0;
for (const file of pages) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const found = text.match(raw);
  if (found) { bad += found.length; console.log(`!! ${file}: ${found.length} raw template <img>: ${found[0]}`); }
}
console.log(bad ? `${bad} raw template <img> still left` : 'verified: every card <img> goes through picTag()');
process.exitCode = bad ? 1 : 0;
