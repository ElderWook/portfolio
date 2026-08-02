// js/citations-integrity.test.mjs — every drill lookup token must resolve to a real tab node/label or footnote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveToken } from './citations.js';
import { pathTo } from './contents.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const necTabs = read('data/tabs/nec-curated.json').tabs;
const oshaTabs = read('data/tabs/osha-curated.json').tabs;
const tabsFor = (book) => (book === 'osha' ? oshaTabs : necTabs);
const NEC = ['nec-250-gec', 'nec-250-122', 'nec-250-122b', 'nec-250-traps'];
const OSHA = ['osha-falls', 'osha-ladders'];

for (const topic of [...NEC, ...OSHA]) {
  test(`drill lookup tokens resolve: ${topic}`, () => {
    const book = topic.startsWith('osha') ? 'osha' : 'nec';
    const { drills } = read(`data/drills/${topic}.json`);
    for (const d of drills) {
      for (const tok of d.lookupPath || []) {
        if (tok === 'footnote-zone') continue;
        const r = resolveToken(tok, tabsFor(book));
        assert.notEqual(r.kind, null, `${topic}/${d.id}: "${tok}" resolves to nothing`);
      }
    }
  });
}

// Task 10 (+ OSHA finder-parity fix): a drill's `finder` paths must actually
// be reachable through the tool(s) they name, or the hard-gate can never
// release on that tool. The Index panel (codebook-mock.js) only ever emits
// an entry's cite[0]; the Contents panel only emits a real outline leaf's
// cite. A finder is not required to carry both paths — a book/topic with no
// index entry for its cite (e.g. OSHA fall-protection) is legitimately
// CONTENTS-ONLY, and the trainer chooser (js/screens/trainer.js) only offers
// the tools a finder actually supports. So for every finder drill:
//   (a) IF finder.indexPath is present, it must contain the cite[0] of at
//       least one index entry in data/index/<book>.json — otherwise no index
//       click can ever fire it.
//   (b) every finder.contentsPath token present must be a real contents leaf
//       (pathTo(outline, tok) non-null in data/contents/<book>.json).
//   (c) every finder must carry at least one of indexPath/contentsPath — a
//       finder with neither could never be satisfied by any tool at all.
for (const topic of [...NEC, ...OSHA]) {
  test(`finder paths are reachable through their tool: ${topic}`, () => {
    const book = topic.startsWith('osha') ? 'osha' : 'nec';
    const { drills } = read(`data/drills/${topic}.json`);
    const indexCiteHeads = new Set((read(`data/index/${book}.json`).entries || []).map((e) => e.cite[0]));
    const outline = read(`data/contents/${book}.json`).outline;
    for (const d of drills) {
      if (!d.finder) continue;
      const hasIndexPath = Array.isArray(d.finder.indexPath) && d.finder.indexPath.length > 0;
      const hasContentsPath = Array.isArray(d.finder.contentsPath) && d.finder.contentsPath.length > 0;
      assert.ok(
        hasIndexPath || hasContentsPath,
        `${topic}/${d.id}: finder has neither indexPath nor contentsPath, so no tool could ever satisfy it`
      );
      if (hasIndexPath) {
        assert.ok(
          d.finder.indexPath.some((tok) => indexCiteHeads.has(tok)),
          `${topic}/${d.id}: no finder.indexPath token is the cite[0] of any index entry, so the Index tool can never satisfy this drill`
        );
      }
      if (hasContentsPath) {
        for (const tok of d.finder.contentsPath) {
          assert.notEqual(
            pathTo(outline, tok),
            null,
            `${topic}/${d.id}: finder.contentsPath "${tok}" is not a real contents leaf`
          );
        }
      }
    }
  });
}
