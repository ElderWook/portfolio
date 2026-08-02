// js/index-search.test.mjs — run: cd play/fl-electrical && node --test js/
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { searchIndex } = await import('./index-search.js');

const CORPUS = {
  bookId: 'nec',
  entries: [
    { term: 'Equipment grounding conductor', aka: ['EGC'], cite: ['250.122', 'Table 250.122'], subject: 'Grounding' },
    { term: 'Pools, fountains, and similar installations', aka: ['pool', 'spa', 'hydromassage'], cite: ['Article 680', '680.70'], subject: 'Special occupancies' },
  ],
  climbs: [{ tooSpecific: 'hot tub', listedAs: 'Pools, fountains, and similar installations', why: 'filed under the occupancy family' }],
};

test('matches on term (case-insensitive)', () => {
  const r = searchIndex('grounding', CORPUS);
  assert.equal(r.matches.length, 1);
  assert.deepEqual(r.matches[0].cite, ['250.122', 'Table 250.122']);
  assert.equal(r.climb, null);
});
test('matches on an aka synonym', () => {
  assert.equal(searchIndex('spa', CORPUS).matches[0].term, 'Pools, fountains, and similar installations');
});
test('no match surfaces a climb hint, not a dead end', () => {
  const r = searchIndex('hot tub', CORPUS);
  assert.equal(r.matches.length, 0);
  assert.equal(r.climb.listedAs, 'Pools, fountains, and similar installations');
});
test('empty query returns no matches and no climb', () => {
  assert.deepEqual(searchIndex('   ', CORPUS), { matches: [], climb: null });
});

import { readFileSync } from 'node:fs';
import { resolveToken } from './citations.js';
const readJSON = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
for (const book of ['nec', 'osha']) {
  test(`index cites resolve to a tab: ${book}`, () => {
    const idx = readJSON(`data/index/${book}.json`);
    const tabs = readJSON(`data/tabs/${book}-curated.json`).tabs;
    for (const e of idx.entries) for (const c of e.cite) {
      assert.notEqual(resolveToken(c, tabs).kind, null, `${book}: index cite "${c}" resolves to nothing`);
    }
  });
}
