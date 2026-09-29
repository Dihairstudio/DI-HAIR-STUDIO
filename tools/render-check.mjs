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
const { pic, picTag, heroPhoto, locationPhoto, photoUrl, photoId, PIC } = new Function(
  'DIHAIR', `${helpersSrc}\n;return { pic, picTag, heroPhoto, locationPhoto, photoUrl, photoId, PIC };`
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
  ok(/[?&]q=78/.test(out), `pic() missing q=78: ${out}`);
  used.add(photoId(photoUrl(url)));
}

/* --- 2. hero markup ------------------------------------------------------ */
const slide = DIHAIR.heroSlides[0];
const heroHtml = heroPhoto(slide);
ok(heroHtml.includes('<picture>'), 'hero markup lost its <picture> wrapper');
ok(heroHtml.includes('media="(max-width:760px)"'), 'hero markup has no portrait source for mobile');
ok(heroHtml.includes('fetchpriority="high"'), 'hero image is not marked as the LCP candidate');
ok(/--pos-d:[^"]+/.test(heroHtml) && /--pos-m:[^"]+/.test(heroHtml), 'hero image carries no focal points');
const [heroW, heroH] = PIC.hero.box;
const heroDesktop = pic(slide.image, heroW, heroH);
ok(heroHtml.includes(`src="${heroDesktop}"`), `hero desktop src is not the ${heroW}x${heroH} crop`, heroDesktop);

/* --- 3. static fallback shares the script's request ---------------------- */
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

/* --- 6. location cards are art-directed (wide crop vs mobile crop) -------- */
const loc = (DIHAIR.locations || [])[0];
const locHtml = locationPhoto(loc);
const [locMw, locMh] = PIC.location.mobile;
ok(locHtml.includes('<picture>'), 'location markup lost its <picture> wrapper');
ok(locHtml.includes('media="(max-width:760px)"'), 'location markup has no mobile-only crop source');
ok(locHtml.includes(pic(loc.image, locMw, locMh)),
  `location mobile srcset does not request the ${locMw}x${locMh} crop`);
const locSingle = [['js/main.js', mainSrc],
  ...pageFiles.map(f => [f, readFileSync(join(ROOT, f), 'utf8')])]
  .filter(([, text]) => /picTag\([^)]*'location'/.test(text)).map(([f]) => f);
ok(locSingle.length === 0,
  `location card still uses the single-crop picTag() -> one crop for two card shapes`,
  locSingle.join(', '));

console.log(`${failed === 0 ? 'PASS' : `${failed} check(s) failed`} — ${urls.length} photo URLs, ${used.size} unique photos, ${DIHAIR.heroSlides.length} hero slides`);
process.exit(failed ? 1 : 0);
