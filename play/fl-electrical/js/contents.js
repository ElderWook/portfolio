// js/contents.js — table-of-contents outline helpers. Authored short titles + numbers only (cite-only).
import { normalizeCite } from './citations.js';

export function flattenLeaves(outline = []) {
  const out = [];
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.children && n.children.length) walk(n.children);
    else if (n.cite) out.push({ id: n.id, label: n.label, cite: normalizeCite(n.cite) });
  });
  walk(outline);
  return out;
}

export function pathTo(outline = [], cite) {
  const target = normalizeCite(cite);
  let found = null;
  const walk = (nodes, trail) => {
    for (const n of nodes) {
      const next = [...trail, n];
      if (n.cite && normalizeCite(n.cite) === target) { found = next; return true; }
      if (n.children && walk(n.children, next)) return true;
    }
    return false;
  };
  walk(outline, []);
  return found;
}
