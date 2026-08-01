// js/progress.test.mjs — run: cd play/fl-electrical && node --test js/
import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = (() => { let m = {}; return {
  getItem: (k) => (k in m ? m[k] : null),
  setItem: (k, v) => { m[k] = String(v); },
  removeItem: (k) => { delete m[k]; },
}; })();
const { loadProgress, resetProgress, markStarted } = await import('./progress.js');
const KEY = 'fl-electrical-v1';

test('missing -> DEFAULT, started false', () => {
  resetProgress(KEY);
  assert.equal(loadProgress(KEY).started, false);
});
test('corrupt JSON -> DEFAULT (no throw)', () => {
  localStorage.setItem(KEY, '{not json');
  assert.equal(loadProgress(KEY).started, false);
});
test('merge back-fills NEW default fields over an old save', () => {
  localStorage.setItem(KEY, JSON.stringify({ started: true }));  // old shape
  const p = loadProgress(KEY);
  assert.equal(p.started, true);
  assert.deepEqual(p.missLog, []);        // new field restored from DEFAULT
});
test('markStarted is idempotent (startedAt set once)', () => {
  resetProgress(KEY);
  const a = markStarted(KEY).startedAt;
  const b = markStarted(KEY).startedAt;
  assert.equal(a, b);
});
