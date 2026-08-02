// js/citations.test.mjs — run: cd play/fl-electrical && node --test js/
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { normalizeCite, splitCiteString, resolveToken } = await import('./citations.js');

const TABS = [
  { label: '250.122 EGC', targets: ['250.122', '250.122(B)'], pillar: '250' },
  { label: 'Ch9 T8 Properties', targets: ['Chapter 9 Table 8'], pillar: 'ch9' },
];

test('normalizeCite trims and preserves Table/section distinction', () => {
  assert.equal(normalizeCite('  250.122 '), '250.122');
  assert.equal(normalizeCite('Table 250.122'), 'Table 250.122');
  assert.equal(normalizeCite('table  250.66'), 'Table 250.66'); // collapse + Titlecase "Table"
});
test('splitCiteString splits comma-joined cites into normalized tokens', () => {
  assert.deepEqual(splitCiteString('250.122, Table 250.122'), ['250.122', 'Table 250.122']);
});
test('resolveToken finds a node inside a tab', () => {
  assert.deepEqual(resolveToken('250.122(B)', TABS), { kind: 'node', tabLabel: '250.122 EGC' });
});
test('resolveToken matches a tab label', () => {
  assert.deepEqual(resolveToken('250.122 EGC', TABS), { kind: 'tab', tabLabel: '250.122 EGC' });
});
test('resolveToken returns null kind for an unknown token', () => {
  assert.deepEqual(resolveToken('999.999', TABS), { kind: null, tabLabel: null });
});
