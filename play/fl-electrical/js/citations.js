// js/citations.js — one canonical citation token, shared across tabs/index/contents/drills.
// CITE-ONLY: tokens are article/section/table NUMBERS and tab LABELS, never code text.

export function normalizeCite(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, ' ');
  // Titlecase a leading "table" so "table 250.66" === "Table 250.66"
  s = s.replace(/^table\b/i, 'Table');
  s = s.replace(/^article\b/i, 'Article');
  s = s.replace(/^chapter\b/i, 'Chapter');
  return s;
}

export function splitCiteString(raw) {
  return String(raw || '')
    .split(',')
    .map((t) => normalizeCite(t))
    .filter(Boolean);
}

export function resolveToken(token, tabs = []) {
  const t = normalizeCite(token);
  const nodeTab = tabs.find((tab) => (tab.targets || []).map(normalizeCite).includes(t));
  if (nodeTab) return { kind: 'node', tabLabel: nodeTab.label };
  const labelTab = tabs.find((tab) => normalizeCite(tab.label) === t);
  if (labelTab) return { kind: 'tab', tabLabel: labelTab.label };
  return { kind: null, tabLabel: null };
}
