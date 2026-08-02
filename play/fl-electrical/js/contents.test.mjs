// js/contents.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { flattenLeaves, pathTo } = await import('./contents.js');

const OUTLINE = [
  { id: 'ch5', label: 'Chapter 5', children: [
    { id: 'art680', label: 'Article 680', children: [
      { id: '680.70', label: '680.70 Hydromassage', cite: '680.70' },
    ]},
  ]},
];

test('flattenLeaves returns only leaves with a cite', () => {
  const leaves = flattenLeaves(OUTLINE);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].cite, '680.70');
});
test('pathTo returns the root->leaf chain', () => {
  const path = pathTo(OUTLINE, '680.70').map((n) => n.id);
  assert.deepEqual(path, ['ch5', 'art680', '680.70']);
});
test('pathTo returns null for an unknown cite', () => {
  assert.equal(pathTo(OUTLINE, '999.9'), null);
});

import { readFileSync } from 'node:fs';
import { resolveToken } from './citations.js';
const readJSON = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
for (const book of ['nec', 'osha']) {
  test(`contents leaf cites resolve: ${book}`, () => {
    const { outline } = readJSON(`data/contents/${book}.json`);
    const tabs = readJSON(`data/tabs/${book}-curated.json`).tabs;
    for (const leaf of flattenLeaves(outline)) {
      assert.notEqual(resolveToken(leaf.cite, tabs).kind, null, `${book}: contents leaf "${leaf.cite}" resolves to nothing`);
    }
  });
}
