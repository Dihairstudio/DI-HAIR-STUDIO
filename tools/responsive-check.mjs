#!/usr/bin/env node
/* Responsive + image QA in real headless Chrome (CDP, zero dependencies).

     node tools/responsive-check.mjs [width ...]

   Renders every page at the widths from the acceptance list (320 … 1920) and
   FAILS when the responsive contract is broken:

     - horizontal page overflow / elements sticking out of the viewport
     - broken, zero-sized or stretched photos (wrong aspect box)
     - header: desktop nav vs hamburger not matching the width
     - mobile menu that cannot open, panel wider than the screen, cannot close
     - carousel that cannot scroll (arrow keys / arrows) although it overflows
     - hero that cannot advance / dots not matching the slides
     - JS exceptions thrown while loading or resizing

   Report (every measurement, incl. warnings): tools/_review/responsive-report.json
   Exit code 0 = READY TO DEPLOY. */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, 'tools', '_review', 'responsive-report.json');

/* Acceptance list: 320, 375, 390, 430, 600, 768, 834, 1024, 1280, 1366,
   1440, 1536, 1920 — with a realistic device height for each. */
const HEIGHTS = {
  320: 568, 375: 667, 390: 844, 430: 932, 600: 960, 768: 1024, 834: 1112,
  1024: 768, 1280: 800, 1366: 768, 1440: 900, 1536: 864, 1920: 1080
};
const PAGES = ['index.html',
  ...readdirSync(join(ROOT, 'pages')).filter(f => f.endsWith('.html')).sort().map(f => `pages/${f}`)];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const exe = process.platform === 'win32' ? 'chrome.exe'
    : process.platform === 'darwin' ? 'Google Chrome' : 'google-chrome';
  const roots = process.platform === 'win32'
    ? [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'],
       process.env.LOCALAPPDATA]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS']
      : ['/usr/bin', '/usr/local/bin', '/opt/google/chrome'];
  const rel = process.platform === 'win32'
    ? ['Google\\Chrome\\Application', 'Google\\Chrome\\Application']
    : process.platform === 'darwin' ? [''] : [''];
  for (const r of roots) {
    if (!r) continue;
    for (const sub of rel) {
      const p = sub ? join(r, sub, exe) : join(r, exe);
      if (existsSync(p)) return p;
    }
  }
  const fallback = { win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linux: '/usr/bin/google-chrome' }[process.platform];
  if (fallback && existsSync(fallback)) return fallback;
  throw new Error('Google Chrome not found — install Chrome or edit findChrome() in this file.');
}

/* ---------- minimal CDP client (Node >= 21 has a global WebSocket) -------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    this.exceptions = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
      }
    };
  }
  send(method, params = {}) {
    const id = this.next++;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout: ' + method)); }
      }, 30000);
    });
  }
  /* Evaluate a script in the page; resolves to {value, exceptionDetails}. */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(
      'audit script threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

/* --- in-page audit (sync) ------------------------------------------------
   Measures the real layout: viewport overflow, text clipping, photo health,
   carousel geometry and which header navigation is active. */
const AUDIT = `(function () {
  var root = document.documentElement;
  var cw = root.clientWidth;
  function sl(el) {
    if (!el || el.nodeType !== 1) return String(el);
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList && el.classList.length) s += '.' + Array.prototype.slice.call(el.classList, 0, 2).join('.');
    var p = el.parentElement;
    if (p && p !== document.body) {
      var n = Array.prototype.indexOf.call(p.children, el) + 1;
      if (n > 0) s += ':nth-child(' + n + ')';
    }
    return s;
  }
  function vis(el) {
    var s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }
  function scrollerOf(el) {
    for (var p = el.parentElement; p && p !== root; p = p.parentElement) {
      var ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return p;
    }
    return null;
  }
  var out = {
    cw: cw, vh: root.clientHeight,
    htmlScrollW: root.scrollWidth, bodyScrollW: document.body.scrollWidth,
    overflow: [], textClip: [], imgMissingCards: document.querySelectorAll('.is-img-missing').length,
    images: { total: 0, broken: [], stretched: [], zero: [] },
    nav: { desktop: false, toggle: false }, carousels: []
  };
  var all = document.querySelectorAll('body *');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (!vis(el)) continue;
    var s = getComputedStyle(el);
    if (s.position === 'fixed') continue;
    var r = el.getBoundingClientRect();
    if (r.right > cw + 1 || r.left < -1) {
      out.overflow.push({ el: sl(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), inScroller: !!scrollerOf(el) });
    }
    var t = (el.textContent || '').trim();
    var shellish = el.classList.contains('carousel') || (el.querySelector && el.querySelector('.carousel'));
    if (t && !shellish && el.clientWidth > 8 && el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'auto' && s.overflowX !== 'scroll') {
      out.textClip.push({ el: sl(el), client: el.clientWidth, scroll: el.scrollWidth, text: t.slice(0, 36) });
    }
  }
  var imgs = document.querySelectorAll('img');
  for (var j = 0; j < imgs.length; j++) {
    var im = imgs[j];
    if (getComputedStyle(im).display === 'none') continue;
    out.images.total++;
    if (im.complete && im.naturalWidth === 0) { out.images.broken.push(sl(im) + ' ' + (im.currentSrc || im.src).slice(0, 60)); continue; }
    var rr = im.getBoundingClientRect();
    if (rr.width < 2 || rr.height < 2) { out.images.zero.push(sl(im)); continue; }
    if (im.complete && im.naturalWidth > 0 && getComputedStyle(im).objectFit === 'fill') {
      var nat = im.naturalWidth / im.naturalHeight, box = rr.width / rr.height;
      if (Math.abs(box / nat - 1) > 0.06) {
        out.images.stretched.push({ el: sl(im), natural: im.naturalWidth + 'x' + im.naturalHeight, box: Math.round(rr.width) + 'x' + Math.round(rr.height) });
      }
    }
  }
  var dn = document.querySelector('.desktop-nav'), tg = document.querySelector('.menu-toggle');
  out.nav = { desktop: !!dn && vis(dn), toggle: !!tg && vis(tg) };
  var trs = document.querySelectorAll('.carousel-track');
  out.carousels = Array.prototype.slice.call(trs).map(function (tr) {
    var it = tr.firstElementChild;
    return {
      items: tr.children.length, client: tr.clientWidth, scroll: tr.scrollWidth,
      itemW: it ? Math.round(it.getBoundingClientRect().width) : 0,
      scrollable: tr.scrollWidth > tr.clientWidth + 4
    };
  });
  return out;
})()`;

/* Walk the page so every lazy photo is requested, then return to the top. */
const SCROLL = `(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var prev = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = 'auto';
  var step = Math.max(400, Math.round(window.innerHeight * 0.8));
  var h = document.body.scrollHeight;
  return (function walk(y) {
    window.scrollTo(0, y);
    return sleep(70).then(function () { return y + step < h ? walk(y + step) : null; });
  })(0).then(function () {
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = prev;
    return sleep(250);
  });
})()`;

/* Hamburger: must open, fit the screen, and close again. */
const MENU_TEST = `(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var tg = document.getElementById('menuToggle'), menu = document.getElementById('mobileMenu');
  if (!tg || !menu) return Promise.resolve(null);
  tg.click();
  return sleep(450).then(function () {
    var ms = getComputedStyle(menu);
    var panel = menu.querySelector('.mobile-menu-inner');
    var pr = panel ? panel.getBoundingClientRect() : null;
    var link = menu.querySelector('.mobile-nav-links a');
    var res = {
      display: ms.display, visibility: ms.visibility, opacity: +ms.opacity,
      panelW: pr ? Math.round(pr.width) : 0, panelTop: pr ? Math.round(pr.top) : 0,
      panelLeft: pr ? Math.round(pr.left) : 0, panelRight: pr ? Math.round(pr.right) : 0,
      links: menu.querySelectorAll('.mobile-nav-links a').length,
      firstLinkH: link ? Math.round(link.getBoundingClientRect().height) : 0,
      locked: document.body.classList.contains('menu-locked'),
      vw: document.documentElement.clientWidth
    };
    var close = document.getElementById('mobileClose');
    if (close) close.click();
    return sleep(400).then(function () {
      res.closed = !menu.classList.contains('is-open') && !document.body.classList.contains('menu-locked');
      return res;
    });
  });
})()`;

/* A track that overflows must actually move on ArrowRight. */
const CAROUSEL_TEST = `(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var tracks = Array.prototype.slice.call(document.querySelectorAll('.carousel-track'));
  var t0 = null;
  for (var i = 0; i < tracks.length; i++) if (tracks[i].scrollWidth > tracks[i].clientWidth + 4) { t0 = tracks[i]; break; }
  if (!t0) return Promise.resolve({ keyMoved: null, scrollable: 0 });
  var before = t0.scrollLeft;
  t0.focus();
  t0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  return sleep(700).then(function () {
    var after = t0.scrollLeft;
    var shell = t0.closest('.carousel');
    return {
      scrollable: tracks.filter(function (tr) { return tr.scrollWidth > tr.clientWidth + 4; }).length,
      keyMoved: { before: Math.round(before), after: Math.round(after), moved: after > before + 2 },
      arrows: shell ? shell.querySelectorAll('.carousel-btn').length : 0,
      fitted: shell ? shell.classList.contains('is-fitted') : null
    };
  });
})()`;

/* Hero: the next arrow must move to another slide and dots must match. */
const HERO_TEST = `(function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero-slide'));
  if (!slides.length) return Promise.resolve(null);
  var idx = function () { for (var i = 0; i < slides.length; i++) if (slides[i].classList.contains('is-active')) return i; return -1; };
  var before = idx();
  var nx = document.querySelector('.hero-next');
  if (nx) nx.click();
  return sleep(500).then(function () {
    var im = document.querySelector('.hero-slide.is-active .hero-media') || document.querySelector('.hero-slide.is-active img');
    var r = im ? im.getBoundingClientRect() : null;
    return {
      slides: slides.length, dots: document.querySelectorAll('.hero-dot').length,
      before: before, after: idx(), img: r ? Math.round(r.width) + 'x' + Math.round(r.height) : null
    };
  });
})()`;

/* CSS background photos (story, nail, hero fallback) must really load. */
const BG_TEST = `(function () {
  var urls = [];
  var els = document.querySelectorAll('.story-image, .nail-image, .hero-slide');
  for (var i = 0; i < els.length; i++) {
    var bi = getComputedStyle(els[i]).backgroundImage;
    var m = bi && bi.match(/url\\(["']?([^"')]+)["']?\\)/);
    if (m && urls.indexOf(m[1]) < 0) urls.push(m[1]);
  }
  return Promise.all(urls.map(function (u) {
    return new Promise(function (res) {
      var im = new Image(), done = false;
      var fin = function (ok) { if (!done) { done = true; res({ url: u, ok: ok }); } };
      im.onload = function () { fin(true); };
      im.onerror = function () { fin(false); };
      setTimeout(function () { fin(null); }, 15000);
      im.src = u;
    });
  })).then(function (rs) {
    return {
      count: urls.length,
      bad: rs.filter(function (r) { return r.ok === false; }).map(function (r) { return r.url; }),
      unknown: rs.filter(function (r) { return r.ok === null; }).length
    };
  });
})()`;

async function launch() {
  const port = 9200 + Math.floor(Math.random() * 600);
  const profile = join(tmpdir(), 'dihair-cdp-' + process.pid);
  const proc = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--disable-component-update',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    } catch { /* DevTools not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error('Chrome did not expose a DevTools target'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
  return { proc, cdp: new CDP(ws) };
}

async function waitReady(cdp) {
  for (let i = 0; i < 120; i++) {
    const r = await cdp.evaluate('document.readyState').catch(() => null);
    if (r === 'complete') return true;
    await sleep(250);
  }
  return false;
}

async function settleImages(cdp, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await cdp.evaluate('Array.prototype.filter.call(document.images, function(i){return !i.complete;}).length')
      .catch(() => 0);
    if (n === 0) return true;
    await sleep(300);
  }
  return false;
}

async function auditPage(cdp, file, widths) {
  const url = 'file:///' + encodeURI(join(ROOT, file).replace(/\\/g, '/'));
  await cdp.send('Page.navigate', { url });
  await waitReady(cdp);
  await cdp.evaluate('document.fonts ? document.fonts.ready.then(function(){return 1;}) : 1');
  await cdp.evaluate(SCROLL);
  await settleImages(cdp);
  cdp.exceptions.length = 0;

  const out = { file, widths: {}, fails: [], warns: [] };
  for (const w of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: HEIGHTS[w] || 900, deviceScaleFactor: 1, mobile: w <= 760
    });
    await sleep(220);
    const a = await cdp.evaluate(AUDIT);
    const rec = { cw: a.cw, htmlScrollW: a.htmlScrollW, images: a.images, nav: a.nav,
      carousels: a.carousels, menu: null, carousel: null, hero: null, fails: [] };
    const fail = f => { rec.fails.push(f); out.fails.push(`${w}px  ${f}`); };

    if (a.htmlScrollW > a.cw + 1) fail(`horizontal page overflow: scrollWidth ${a.htmlScrollW} > ${a.cw}`);
    const outside = a.overflow.filter(o => !o.inScroller);
    if (outside.length) fail('outside viewport: ' + outside.slice(0, 4).map(o => `${o.el} [${o.left}..${o.right}]`).join(' | '));
    if (a.images.broken.length) fail('broken images: ' + a.images.broken.slice(0, 3).join(' | '));
    if (a.images.stretched.length) fail('stretched images: ' + a.images.stretched.slice(0, 3).map(s => `${s.el} ${s.natural}->${s.box}`).join(' | '));
    if (a.images.zero.length) fail('zero-size images: ' + a.images.zero.slice(0, 3).join(' | '));
    if (a.imgMissingCards) fail(`${a.imgMissingCards} card(s) flagged is-img-missing`);
    const wantDesktop = w > 1100;
    if (a.nav.desktop !== wantDesktop || a.nav.toggle === wantDesktop) {
      fail(`header: desktopNav=${a.nav.desktop} hamburger=${a.nav.toggle} (expected desktopNav=${wantDesktop})`);
    }
    if (a.textClip.length) out.warns.push(`${w}px  text clipped: ` + a.textClip.slice(0, 3).map(t => `${t.el} ${t.scroll}>${t.client} "${t.text}"`).join(' | '));

    if (a.nav.toggle) {
      const m = await cdp.evaluate(MENU_TEST);
      if (m) {
        rec.menu = m;
        if (m.display === 'none' || m.visibility !== 'visible' || m.opacity < 0.5) fail(`menu not visible (display=${m.display}, visibility=${m.visibility}, opacity=${m.opacity})`);
        if (m.panelW < 120 || m.panelRight > m.vw + 1 || m.panelLeft < -1) fail(`menu panel off-screen (w=${m.panelW}, ${m.panelLeft}..${m.panelRight} of ${m.vw})`);
        if (!m.links || m.firstLinkH < 10) fail('menu links not visible');
        if (!m.closed) fail('menu did not close / page still scroll-locked');
      }
    }
    if (w === widths[0]) {
      const c = await cdp.evaluate(CAROUSEL_TEST);
      rec.carousel = c;
      if (c && c.scrollable > 0 && !(c.keyMoved && c.keyMoved.moved)) fail('carousel overflows but ArrowRight does not scroll it');
    }
    if (file === 'index.html' && (w === widths[0] || w === widths[widths.length - 1])) {
      const hr = await cdp.evaluate(HERO_TEST);
      rec.hero = hr;
      if (hr) {
        if (hr.after === hr.before) fail('hero next arrow did not advance the slide');
        if (hr.dots !== hr.slides) fail(`hero dots ${hr.dots} != slides ${hr.slides}`);
      }
    }
    out.widths[w] = rec;
  }

  const bg = await cdp.evaluate(BG_TEST);
  out.backgrounds = bg;
  if (bg.bad.length) out.fails.push('background photos failed: ' + bg.bad.join(' | '));
  if (bg.unknown) out.warns.push(`${bg.unknown} background photo(s) still loading after 15s`);
  out.exceptions = cdp.exceptions.slice();
  if (out.exceptions.length) out.fails.push('JS exceptions: ' + out.exceptions.slice(0, 3).join(' | '));
  return out;
}

/* ------------------------------- run ------------------------------------ */
const argv = process.argv.slice(2);
const argWidths = argv.filter(a => /^\d+$/.test(a)).map(Number);
const pageArg = argv.find(a => a.startsWith('--page='));
const widths = (argWidths.length ? argWidths : Object.keys(HEIGHTS).map(Number)).filter(w => HEIGHTS[w]);
const pages = pageArg ? [pageArg.slice(7)] : PAGES;

console.log(`responsive-check — ${pages.length} pages x ${widths.length} widths (${widths.join(', ')})`);

const results = [];
try {
  const { proc, cdp } = await launch();
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    for (const file of pages) {
      process.stdout.write(`  ${file.padEnd(24)}`);
      const r = await auditPage(cdp, file, widths);
      results.push(r);
      const bad = Object.values(r.widths).filter(x => x.fails.length).length;
      console.log(bad ? `FAIL  ${bad}/${widths.length} widths` : `ok    ${widths.length} widths`);
    }
  } finally {
    try { cdp.ws.close(); } catch { /* already closed */ }
    proc.kill();
  }
} catch (err) {
  console.error('responsive-check crashed:', err.message);
  process.exit(1);
}

let fails = 0, warns = 0;
for (const r of results) {
  if (!r.fails.length && !r.warns.length) continue;
  console.log(`\n${r.file}`);
  for (const f of r.fails) console.log('  FAIL  ' + f);
  for (const wn of r.warns) console.log('  warn  ' + wn);
  fails += r.fails.length;
  warns += r.warns.length;
}

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify({
  generated: new Date().toISOString(), widths,
  pages: results.map(r => ({
    file: r.file, fails: r.fails, warns: r.warns, exceptions: r.exceptions, backgrounds: r.backgrounds,
    widths: Object.fromEntries(Object.entries(r.widths).map(([w, v]) => [w, {
      cw: v.cw, htmlScrollW: v.htmlScrollW, photos: v.images.total, broken: v.images.broken.length,
      stretched: v.images.stretched.length, nav: v.nav, cardWidths: v.carousels.map(c => c.itemW),
      heroImg: v.hero ? v.hero.img : null, fails: v.fails
    }]))
  }))
}, null, 2));

console.log(`\n${results.length} pages x ${widths.length} widths = ${results.length * widths.length} checks — ${fails} fail, ${warns} warn`);
console.log(`report: ${REPORT}`);
process.exit(fails ? 1 : 0);
