// js/index-search.js — type-ahead over OUR curated index entries; a miss returns a climb hint.
export function searchIndex(query, corpus) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { matches: [], climb: null };
  const hay = (s) => String(s || '').toLowerCase().includes(q);
  const matches = (corpus.entries || []).filter(
    (e) => hay(e.term) || (e.aka || []).some(hay)
  );
  if (matches.length) return { matches, climb: null };
  const climb = (corpus.climbs || []).find((c) => hay(c.tooSpecific)) || null;
  return { matches: [], climb };
}
