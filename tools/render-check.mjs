/* Render smoke test — runs the real photo helpers from js/main.js without a
   browser, so the URLs the site will request can be verified in CI/terminal.

     node tools/render-check.mjs

   Checks:
     1. every image in js/data.js is requested through pic(): explicit w/h,
        crop strategy and q=78, and dead ids are swapped before the request;
     2. the hero <picture> markup really does ship a desktop and a portrait
        crop, fetchpriority=high, and the focal points;
     3. the static no-JS fallback in index.html asks for the *same* URL as the
        script does for slide 1 — otherwise the browser downloads the hero
        twice;
     4. every photo used by the data has a focal point in DIHAIR.photos. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataSrc = readFileSync(join(ROOT, 'js', 'data.js'), 'utf8');
const DIHAIR = new Function(`${dataSrc}\n;return DIHAIR;`)();

const mainSrc = readFileSync(join(ROOT, 'js', 'main.js'), 'utf8');
const helpersSrc = mainSrc.slice(
  mainSrc.indexOf('const PIC = {'),
  mainSrc.indexOf('\nfunction header() {')
);
const { pic, picTag, heroPhoto, locationPhoto, photoUrl, photoId, PIC, HERO_TIERS } = new Function(
  'DIHAIR', `${helpersSrc}\n;return { pic, picTag, heroPhoto, locationPhoto, photoUrl, photoId, PIC, HERO_TIERS };`
)(DIHAIR);

let failed = 0;
const ok = (cond, label, detail) => {
  if (cond) return;
  failed++;
  console.log(`FAIL ${label}${detail ? `\n     ${detail}` : ''}`);
};

/* --- 1. every photo reference ------------------------------------------- */
const urls = [];
(function walk(node) {
  if (typeof node === 'string') { if (/^https:\/\/images\.unsplash\.com\//.test(node)) urls.push(node); return; }
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === 'object') return Object.values(node).forEach(walk);
})(DIHAIR);

const dead = Object.keys(DIHAIR.photoSubstitute || {});
const used = new Set();
for (const url of urls) {
  const out = pic(url, 640, 400);
  ok(!dead.some(d => out.includes(d)),
    `dead id still requested: ${out}`, 'photoSubstitute did not remap this URL');
  ok(/[?&]w=640/.test(out) && /[?&]h=400/.test(out), `pic() missing explicit size: ${out}`);
  ok(/[?&]crop=(faces|entropy)/.test(out), `pic() missing crop strategy: ${out}`);
  ok(/[?&]q=72/.test(out), `pic() missing q=72: ${out}`);
  ok(/auto=format%2Ccompress/.test(out), `pic() must ask for auto=format,compress (plain auto=format shipped 960 KB PNGs): ${out}`);
  used.add(photoId(photoUrl(url)));
}

/* --- 2. hero markup ------------------------------------------------------ */
const slide = DIHAIR.heroSlides[0];
const heroHtml = heroPhoto(slide, true);
ok(heroHtml.includes('<picture>'), 'hero markup lost its <picture> wrapper');
ok(heroHtml.includes('fetchpriority="high"'), 'hero image is not marked as the LCP candidate');
ok(/--pos-d:[^"]+/.test(heroHtml) && /--pos-m:[^"]+/.test(heroHtml), 'hero image carries no focal points');
/* hero is art-directed per width AND height cell, so the crop ratio can follow
   the box on phones, tablets, laptops, desktops and ultrawides alike */
ok(HERO_TIERS.length >= 6, `hero has only ${HERO_TIERS.length} art-direction tiers`);
for (const t of HERO_TIERS) {
  const media = heroHtml.includes(`media="(min-width:${t.w[0]}px)`);
  ok(media, `hero tier ${t.w[0]}-${t.w[1]} x h${t.h[0]}-${t.h[1]} has no <source>`);
  ok(heroHtml.includes(pic(slide.image, t.box[0], t.box[1])),
    `hero tier ${t.w[0]}-${t.w[1]} does not request its ${t.box[0]}x${t.box[1]} crop`);
  ok(heroHtml.includes(pic(slide.image, t.box[0] * 2, t.box[1] * 2)),
    `hero tier ${t.w[0]}-${t.w[1]} has no 2x candidate (retina would upscale)`);
}
/* only the first slide is the LCP candidate */
ok(heroPhoto(slide, false).includes('fetchpriority="low"'),
  'non-first hero slide still claims fetchpriority=high');

/* --- 3. static fallback shares the script's request ---------------------- */
const heroDesktop = pic(slide.image, PIC.hero.box[0], PIC.hero.box[1]);
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const bg = (indexHtml.match(/--bg:url\('([^']+)'\)/) || [])[1];
ok(!!bg, 'index.html no longer has a static hero background');
ok(bg === heroDesktop,
  'static hero background and the script request differ -> hero loads twice',
  `static: ${bg}\n     script: ${heroDesktop}`);

/* --- 4. focal points exist for every photo used -------------------------- */
const missing = [...used].filter(id => id && !(DIHAIR.photos || {})[id]);
ok(missing.length === 0, `photos without a focal point: ${missing.join(', ')}`);

/* --- 5. card templates must use a helper, not a raw data URL ------------- */
const pageFiles = ['index.html', ...['about', 'academy', 'artists', 'collaboration', 'franchise',
  'locations', 'our-work', 'packages', 'products', 'program', 'promo', 'services']
  .map(n => `pages/${n}.html`)];
const rawImg = /<img[^>]*src=(?:"\$\{|\s*"\+)/g;
const rawHits = [];
for (const file of pageFiles) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const hit of text.match(rawImg) || []) rawHits.push(`${file}: ${hit.slice(0, 90)}`);
}
ok(rawHits.length === 0,
  `${rawHits.length} page image(s) bypass picTag() -> no crop box, srcset, focal point or 404 remap`,
  rawHits.join('\n     '));

/* --- 6. location cards are art-directed per breakpoint ------------------- */
const loc = (DIHAIR.locations || [])[0];
const locHtml = locationPhoto(loc);
ok(locHtml.includes('<picture>'), 'location markup lost its <picture> wrapper');
for (const t of PIC.location.tiers) {
  ok(locHtml.includes(pic(loc.image, t.box[0], t.box[1])),
    `location tier ${t.media || 'default'} does not request its ${t.box[0]}x${t.box[1]} crop`);
  ok(locHtml.includes(pic(loc.image, t.box[0] * 2, t.box[1] * 2)),
    `location tier ${t.media || 'default'} has no 2x candidate`);
}
/* location cards are tiered on the same 6 bands as every other card */
ok(PIC.location.tiers[0].media === '(max-width:479px)',
  'location must art-direct from the smallest band, not jump straight to desktop');
/* locationPhoto delegates to picTag('location'), which is tiered like every
   other card — one check, not two code paths */
ok(/function locationPhoto\([^)]*\)\s*\{[^}]*return picTag\(loc\.image,\s*'location'/.test(mainSrc),
  'locationPhoto must delegate to the tiered picTag() so every card uses one code path');

/* --- 7. every card part is art-directed with 2x candidates ---------------- */
for (const [name, part] of Object.entries(PIC)) {
  if (name === 'hero') continue;
  ok(Array.isArray(part.tiers) && part.tiers.length >= 3,
    `PIC.${name} has no per-breakpoint tiers`);
  for (const t of part.tiers || []) {
    ok(typeof t.sizes === 'string' && t.sizes.length > 0, `PIC.${name} tier has no sizes hint`);
  }
}

/* --- 8. no page hardcodes a photo URL outside the pic() pipeline ---------- */
const literalHits = [];
for (const file of pageFiles) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/(?:background-image:\s*url\(|src=")(https:\/\/images\.unsplash\.com\/[^"')\s]*[?&][^"')\s]+)/g))
    literalHits.push(`${file}: ${m[1].slice(0, 80)}`);
}
ok(literalHits.length === 0,
  `${literalHits.length} hardcoded photo URL(s) bypass pic() -> no q/compress, no 404 remap, no focal point`,
  literalHits.join('\n     '));
for (const [file, sel] of [['index.html', 'story-image'], ['index.html', 'nail-image'],
  ['pages/about.html', 'story-image']]) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  ok(new RegExp(`${sel}[^>]*data-photo=`).test(text),
    `${file} .${sel} is not driven by data-photo -> it bypasses the pic() pipeline`);
}
/* data-photo elements have no URL in the markup, so they must be painted by
   panels() and must have a neutral CSS well underneath for the no-JS case. */
ok(/\$\$\('\[data-photo\]'\)/.test(helpersSrc) && /backgroundImage/.test(helpersSrc),
  'panels() no longer paints [data-photo] elements -> they would stay empty');
const cssText = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
ok(/\.story-image,\.nail-image\{[^}]*background-color/.test(cssText),
  '.story-image/.nail-image lost their no-JS background-color well');
ok(/\.concept-frame img\{[^}]*background:/.test(cssText),
  '.concept-frame img has no no-JS background -> shows a broken-image icon without JS');

console.log(`${failed === 0 ? 'PASS' : `${failed} check(s) failed`} — ${urls.length} photo URLs, ${used.size} unique photos, ${DIHAIR.heroSlides.length} hero slides`);
process.exit(failed ? 1 : 0);
