/* Photo audit fixes for js/data.js — one-shot, safe to re-run (each edit checks
   that the expected photo id is still on its line before writing).

   Why: an eye-check of every 420px thumbnail (node tools/img-check.mjs review)
   showed that several photos did not match the card they were shown in
   (a bookshelf in the perm services, a foot spa for a hair mask, a make-up
   vanity for a branch location) and that 4 ids had been deleted from Unsplash,
   i.e. they 404 and rendered as broken images. Every id below is replaced with
   a *verified live* photo whose subject matches the copy.

   The table is [line, expected old id, new id]; lines are edited bottom-up so
   the line numbers stay valid while the pass runs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = s => `photo-${s}`;
const edits = [
  /* ---- locations: JOCA showed a make-up vanity -> salon interior ---------- */
  [40, '1516975080664-ed2fc6a32937', '1560066984-138dadb4c035'],
  /* ---- signature services ------------------------------------------------ */
  [110, '1595476108010-b4d1f102b1b1', '1544005313-94ddf0286df2'],   /* CUT WANITA    -> woman portrait          */
  [116, '1522337360788-8b13dee7a37e', '1595476108010-b4d1f102b1b1'], /* CREAMBATH     -> wash basin + scalp work */
  [122, '1519415510236-718bdfcd89c8', '1522337360788-8b13dee7a37e'], /* HAIR SPA MASK -> healthy wavy hair       */
  [128, '1522337094846-8a8101f3641c', '1503951914875-452162b0f3f1'], /* DEAD -> barber shave (men's care)        */
  [140, '1605497746444-177369a42e5d', '1492106087820-71f1a00d2b11'], /* DEAD -> coloured (lavender) hair         */
  [146, '1492106087820-71f1a00d2b11', '1488426862026-3ee34a7d66df'], /* GREY COVER    -> natural dark hair       */
  [158, '1519014816548-bf5fe059798b', '1519415510236-718bdfcd89c8'], /* PEDICURE      -> foot spa                */
  /* ---- catalog ----------------------------------------------------------- */
  [172, '1595476108010-b4d1f102b1b1', '1544005313-94ddf0286df2'],   /* HAIRCUT WANITA    -> woman portrait    */
  [184, '1516975080664-ed2fc6a32937', '1595476108010-b4d1f102b1b1'], /* WASH & STYLING    -> wash basin        */
  [202, '1519415510236-718bdfcd89c8', '1519699047748-de8e457a634e'], /* HAIR MASK SPA     -> voluminous hair   */
  [208, '1519699047748-de8e457a634e', '1488426862026-3ee34a7d66df'], /* ANTI RONTOK       -> thick dark hair   */
  [214, '1522337094846-8a8101f3641c', '1535585209827-a15fcdbc4c2d'], /* DEAD -> botanical scalp bottle         */
  [226, '1500648767791-00dcc994a43e', '1544005313-94ddf0286df2'],   /* CAT UBAN PREMIUM  -> natural colour    */
  [232, '1605497746444-177369a42e5d', '1488426862026-3ee34a7d66df'], /* DEAD -> natural dark hair             */
  [238, '1560066984-138dadb4c035', '1516975080664-ed2fc6a32937'],    /* COLOR ASH BASIC   -> colour station    */
  [244, '1605497746444-177369a42e5d', '1492106087820-71f1a00d2b11'], /* DEAD -> coloured (lavender) hair      */
  [250, '1560066984-138dadb4c035', '1598452963314-b09f397a5c48'],    /* HAIR ASH PREMIUM  -> colour products   */
  [256, '1605497746444-177369a42e5d', '1516975080664-ed2fc6a32937'], /* DEAD -> colour station (2 palets)     */
  [262, '1560066984-138dadb4c035', '1598452963314-b09f397a5c48'],    /* 2 MIX COLOR PREM  -> colour products   */
  [268, '1519699047748-de8e457a634e', '1492106087820-71f1a00d2b11'], /* BLEACHING 1X      -> lightened hair    */
  [274, '1560066984-138dadb4c035', '1516975080664-ed2fc6a32937'],    /* HIGHLIGHT BLEACH  -> colour station    */
  [280, '1522337094846-8a8101f3641c', '1519699047748-de8e457a634e'], /* DEAD -> voluminous (pre-smoothing)    */
  [286, '1519415510236-718bdfcd89c8', '1544005313-94ddf0286df2'],    /* KERATIN INFUSION  -> healthy hair      */
  [292, '1534774592507-488885376ad3', '1622286342621-4bd786c2447c'], /* DOWN PERM FULL (was books)            */
  [304, '1534774592507-488885376ad3', '1519699047748-de8e457a634e'], /* PERM CURLY (was books)                */
  [310, '1534774592507-488885376ad3', '1522337360788-8b13dee7a37e'], /* PERM KOREAN (was books)               */
  [322, '1519014816548-bf5fe059798b', '1519415510236-718bdfcd89c8'], /* PEDICURE         -> foot spa           */
];
  /* ---- packages / products ---------------------------------------------- */
  edits.push(
    [388, '1605497746444-177369a42e5d', '1492106087820-71f1a00d2b11'], /* DEAD -> coloured hair              */
    [406, '1534774592507-488885376ad3', '1519699047748-de8e457a634e'], /* PKG 05 (was books)                 */
    [424, '1519699047748-de8e457a634e', '1522337360788-8b13dee7a37e'], /* PKG 06 -> silky smooth hair        */
    [514, '1608248597359-009d1341c2c3', '1535585209827-a15fcdbc4c2d']  /* DEAD -> botanical bottle (tonic)   */
  );
  /* ---- academy ---------------------------------------------------------- */
  edits.push(
    [563, '1506794778202-cad84cf45f1d', '1622286342621-4bd786c2447c'], /* CUTTING ARCH. -> cut in progress  */
    [574, '1605497746444-177369a42e5d', '1516975080664-ed2fc6a32937'], /* DEAD -> colour station            */
    [585, '1522337094846-8a8101f3641c', '1504593811423-6dd665756598'], /* DEAD -> editorial styling look    */
    [596, '1519415510236-718bdfcd89c8', '1595476108010-b4d1f102b1b1'], /* SCALP HEALTH (was foot spa)       */
    [607, '1604654894610-df63bc536371', '1610992015732-2449b76344bc']  /* NAIL CRAFT -> manicure            */
  );
  /* ---- gallery ---------------------------------------------------------- */
  edits.push(
    [654, '1595476108010-b4d1f102b1b1', '1544005313-94ddf0286df2'],   /* LAYER WANITA    -> woman portrait */
    [659, '1605497746444-177369a42e5d', '1598452963314-b09f397a5c48'], /* DEAD -> colour products           */
    [669, '1522337094846-8a8101f3641c', '1522337360788-8b13dee7a37e'], /* DEAD -> smooth wavy hair          */
    [674, '1560066984-138dadb4c035', '1516975080664-ed2fc6a32937'],    /* BALAYAGE (was interior)           */
    [689, '1534774592507-488885376ad3', '1595476108010-b4d1f102b1b1']  /* KOREAN PERM (was books)           */
  );
  /* ---- hero slide 2: SIGNATURE COLOR (was a bookshelf) ------------------ */
  edits.push([788, '1534774592507-488885376ad3', '1492106087820-71f1a00d2b11']);

const path = join(ROOT, 'js', 'data.js');
const lines = readFileSync(path, 'utf8').split('\n');
let done = 0;
const skipped = [];
for (const [line, from, to] of [...edits].sort((a, b) => b[0] - a[0])) {
  const idx = line - 1;
  const text = lines[idx] || '';
  if (!text.includes(id(from)) || text.includes(id(to))) { skipped.push(line); continue; }
  lines[idx] = text.replace(id(from), id(to));
  done++;
}
writeFileSync(path, lines.join('\n'));
console.log(`${done}/${edits.length} photo references re-pointed`);
if (skipped.length) console.log('skipped lines (already applied or changed):', skipped.join(', '));

