// js/citations-integrity.test.mjs — every drill lookup token must resolve to a real tab node/label or footnote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveToken } from './citations.js';

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
