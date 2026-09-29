/* Image QA helper for the Unsplash photos used across the site.
   Usage:
     node tools/img-check.mjs head   <photo-id> [...]   -> is the id still alive?
     node tools/img-check.mjs review <photo-id> [...]   -> save 420px thumbs into
        tools/_review (dev-only, kept out of the deployable assets/) and report
        the real pixel size (portrait / landscape) so replacements and focal
        points can be chosen by looking at them.
     node tools/img-check.mjs probe  <photo-id> [...]   -> URL-shape / user-agent
        matrix, to tell a dead photo apart from a bot block.
     node tools/img-check.mjs audit                     -> every photo id used by
        the site (js/, *.html) checked once. Ids that survive only as
        DIHAIR.photoSubstitute keys are reported as SAFE: they are remapped
        before they are ever requested, so they cannot 404 in the page.
   No dependencies: dimensions are read straight from the JPEG SOF marker. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.shift();
const ids = args.filter(Boolean);

/* Unsplash's CDN answers HEAD requests inconsistently (the same id can return
   404 once and 200 next), so a photo is only called dead when three real GETs
   of a 64px thumbnail all fail. That keeps the audit from replacing images that
   are actually fine. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function alive(id, tries = 3) {
  const seen = [];
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(q(id, 'w=64&q=40'), { headers: { 'User-Agent': UA } });
      await res.arrayBuffer();
      seen.push(res.status);
      if (res.ok) return { ok: true, seen };
    } catch { seen.push('ERR'); }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 1500));
  }
  return { ok: false, seen };
}

const base = 'https://images.unsplash.com/';
const q = (id, params) => `${base}${id}?auto=format&fit=crop&${params}`;

/* Width/height live in the Start-Of-Frame segment (0xC0-0xCF, except
   C4/C8/CC) of a JPEG: marker, 2-byte length, precision, H, W. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/* probe: run the same id through several URL shapes and client identities so a
   dead id can be told apart from a bot block or a bad query string. */
if (mode === 'probe') {
  const variants = [
    ['bare', id => base + id],
    ['w100', id => `${base}${id}?w=100`],
    ['site', id => q(id, 'w=1200&q=85')],
    ['fmjpg', id => `${base}${id}?fm=jpg&w=600&q=70`],
    ['nocrop', id => `${base}${id}?auto=format&w=1200&q=85`]
  ];
  for (const id of ids) {
    const row = [];
    for (const [name, make] of variants) {
      for (const ua of ['node', 'chrome']) {
        try {
          const res = await fetch(make(id), { method: 'HEAD', headers: ua === 'chrome' ? { 'User-Agent': UA } : {} });
          row.push(`${name}/${ua}:${res.status}`);
        } catch { row.push(`${name}/${ua}:ERR`); }
      }
    }
    console.log(id, '\n   ', row.join('  '));
  }
/* audit: collect every Unsplash photo id used by the site (js/data.js,
   index.html, pages/*.html), check each one once and report the dead ones with
   the exact file + line they appear in, so they can be replaced. */
} else if (mode === 'audit') {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'node_modules' || name === '_review' || name === '.git') continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(html|js)$/i.test(name)) files.push(p);
    }
  })(ROOT);

  const hits = new Map(); // id -> ["file:line", ...]
  for (const f of files) {
    const text = readFileSync(f, 'utf8').split('\n');
    text.forEach((line, i) => {
      for (const m of line.matchAll(/photo-\d{10,14}-[0-9a-z]{8,14}/g)) {
        if (!hits.has(m[0])) hits.set(m[0], []);
        hits.get(m[0]).push(`${relative(ROOT, f).replace(/\\/g, '/')}:${i + 1}`);
      }
    });
  }

  /* ids that live on only as remap keys (DIHAIR.photoSubstitute) are known
     dead on purpose — they are never requested, so they are not failures. */
  const substituting = new Set();
  const dataFile = files.find(f => f.endsWith(join('js', 'data.js')));
  if (dataFile) {
    const block = readFileSync(dataFile, 'utf8').match(/photoSubstitute\s*=\s*\{([\s\S]*?)\}/);
    if (block) for (const m of block[1].matchAll(/'(photo-[^']+)'\s*:/g)) substituting.add(m[1]);
  }

  const ids = [...hits.keys()].sort();
  console.log(`${ids.length} unique photos across ${files.length} files\n`);
  const dead = [];
  const queue = [...ids];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const { ok, seen } = await alive(id);
      /* a dead id that is only kept as a photoSubstitute key is safe */
      const safe = !ok && substituting.has(id);
      console.log(`${ok ? 'OK  ' : safe ? 'SAFE' : 'DEAD'} ${id}  [${seen.join(',')}]  ${hits.get(id).slice(0, 3).join(', ')}`);
      if (!ok && !safe) dead.push(id);
    }
  }));
  console.log(`\n${dead.length} dead${substituting.size ? ` (plus ${[...substituting].length} ids kept only as photoSubstitute keys)` : ''}:`);
  for (const id of dead) console.log(`  ${id}\n      ${hits.get(id).join('\n      ')}`);
} else if (mode === 'head') {
  for (const id of ids) {
    const { ok, seen } = await alive(id);
    console.log(`${ok ? 'OK  ' : 'DEAD'} ${id}  [${seen.join(',')}]`);
  }
} else if (mode === 'review') {
  const dir = join(ROOT, 'tools', '_review');
  mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    try {
      const res = await fetch(q(id, 'w=420&h=300&q=62'));
      if (!res.ok) { console.log(`FAIL ${id}  ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(dir, `${id}.jpg`), buf);
      const full = await fetch(q(id, 'w=100&q=40'));
      const size = jpegSize(Buffer.from(await full.arrayBuffer()));
      console.log(`got  ${id}  ${Math.round(buf.length / 1024)}kb  ${size ? `${size.w}x${size.h} ${size.w >= size.h ? 'landscape' : 'PORTRAIT'}` : '?'}`);
    } catch (e) { console.log(`FAIL ${id}  ${e.message}`); }
  }
} else {
  console.log('mode must be "head", "review", "probe" or "audit"');
  process.exit(1);
}
