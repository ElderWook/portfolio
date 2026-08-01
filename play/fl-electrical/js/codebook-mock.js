// js/codebook-mock.js — the "fake codebook" widget: a dual-pane mock of a
// physical NEC/OSHA book's tab-and-index navigation, mounted on the right
// pane of the Walkthrough (Task 7) and Trainer (Task 8) screens.
//
// CITE-ONLY: this file and its data (data/tabs/nec-curated.json) ever hold
// article/section/table *numbers* and tab *labels* — never a table cell or
// verbatim code sentence. The values themselves live in the visitor's
// physical book; this widget only teaches *where to look*.
//
//   mountCodebook(el, { mode: 'nec'|'osha', tabs, highlightTarget, onPick })
//
//     el              — container element; fully owned/re-rendered by this
//                        module (same "renderX(root, opts)" convention as
//                        checklist.js/bookmap.js/path.js elsewhere in this app).
//     mode            — 'nec' (tab strip + article tree) or 'osha'
//                        (parts 1926/1904 + subpart/section tree). Both modes
//                        share one engine: `tabs` is always the flat
//                        { label, targets[], pillar } shape; `pillar` is the
//                        grouping key (an NEC article family for 'nec', an
//                        OSHA CFR part for 'osha').
//     tabs            — the tab list for this mode. Callers load this from
//                        JSON (e.g. data/tabs/nec-curated.json for 'nec').
//                        If omitted/empty in 'osha' mode, a small built-in
//                        default parts list renders instead (no OSHA tabs
//                        JSON file exists yet — Task 9 may supply its own
//                        via this same `tabs` param later).
//     highlightTarget — a target string ("250.122(B)"), a tab label
//                        ("250.122 EGC"), or the constant 'footnote-zone'.
//                        The matching node gets a static highlight outline
//                        plus a pulse animation (killed under
//                        prefers-reduced-motion by styles.css's blanket
//                        `animation: none !important` rule, leaving only the
//                        static outline — see styles.css).
//     onPick(id)      — fired on every click of a tab, a tree node, or the
//                        footnote-zone panel, with that element's own id
//                        (tab.label / target string / 'footnote-zone').
//                        Callers (walkthrough/trainer) compare `id` against
//                        a step's/drill's expected target(s).
//
// This is a self-contained mini-widget, not a full screen: it keeps its own
// "which tab is open" state in a closure and re-renders itself on tab clicks
// without involving the caller. Callers re-invoke `mountCodebook` wholesale
// (same pattern as every other renderX here) whenever they want to move the
// highlight — e.g. a Trainer "hint" reveal — which is also the desired UX:
// it mimics a teacher flipping straight to the right tab.

const FOOTNOTE_ID = 'footnote-zone';

// OSHA has no curated tabs JSON of its own yet (out of this task's file
// list) — this default lets 'osha' mode render something real out of the
// box, using section numbers already vetted in data/hotspots/osha.json.
// 1904 (Recording and Reporting) is its own CFR part, not folded under 1910,
// so it gets its own pillar rather than a wrong grouping.
const DEFAULT_OSHA_TABS = [
  { label: 'Electrical Safety', targets: ['1926.404', '1926.416', '1926.417'], pillar: '1926' },
  { label: 'Ladders', targets: ['1926.1053'], pillar: '1926' },
  { label: 'PPE', targets: ['1926.95', '1926.100'], pillar: '1926' },
  { label: 'Battery Charging', targets: ['1926.441'], pillar: '1926' },
  { label: 'Lockout/Tagout', targets: ['1910.147'], pillar: '1910' },
  { label: 'Recordkeeping & Reporting', targets: ['1904.29', '1904.32', '1904.39'], pillar: '1904' },
];

function pillarLabel(mode, pillar) {
  if (mode === 'osha') return `Part ${pillar}`;
  if (pillar === 'ch9') return 'Chapter 9';
  return `Art. ${pillar}`;
}

function footnoteStrategy(mode) {
  return mode === 'osha'
    ? "Check the section’s own definitions and any referenced appendix before you answer — OSHA traps hide in the fine print, not the headline rule."
    : 'Read the notes and exceptions printed directly under the table before you answer — the exam pulls traps from footnotes, not just the table body.';
}

// Groups adjacent same-pillar tabs into visual clusters, preserving the
// authored order (nec-curated.json is written pillar-clustered already).
function groupByPillar(tabs) {
  const groups = [];
  let current = null;
  tabs.forEach((tab, index) => {
    const pillar = tab.pillar || '—';
    if (!current || current.pillar !== pillar) {
      current = { pillar, tabs: [] };
      groups.push(current);
    }
    current.tabs.push({ ...tab, index });
  });
  return groups;
}

// Figures out which tab (if any) a highlightTarget lives in, and whether it
// names a target node, a tab itself, or the footnote zone.
function resolveHighlight(tabs, highlightTarget) {
  if (!highlightTarget) return { tabIndex: null, kind: null, value: null };
  if (highlightTarget === FOOTNOTE_ID) return { tabIndex: null, kind: 'footnote', value: FOOTNOTE_ID };
  const nodeIndex = tabs.findIndex((t) => (t.targets || []).includes(highlightTarget));
  if (nodeIndex !== -1) return { tabIndex: nodeIndex, kind: 'node', value: highlightTarget };
  const tabIndex = tabs.findIndex((t) => t.label === highlightTarget);
  if (tabIndex !== -1) return { tabIndex, kind: 'tab', value: highlightTarget };
  return { tabIndex: null, kind: null, value: null };
}

const HI_CLASS = 'cb-hi cb-hi-pulse';

export function mountCodebook(root, opts = {}) {
  const { mode = 'nec', tabs: suppliedTabs, highlightTarget = null, onPick = () => {} } = opts;

  const tabs = suppliedTabs && suppliedTabs.length ? suppliedTabs : mode === 'osha' ? DEFAULT_OSHA_TABS : [];
  const resolved = resolveHighlight(tabs, highlightTarget);
  let activeIndex = resolved.tabIndex != null ? resolved.tabIndex : tabs.length ? 0 : -1;

  function renderTabButton(tab) {
    const isActive = tab.index === activeIndex;
    const isHi = resolved.kind === 'tab' && resolved.value === tab.label;
    const cls = ['cb-tab', isActive ? 'active' : '', isHi ? HI_CLASS : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" role="tab" aria-selected="${isActive}" data-tab-index="${tab.index}">${tab.label}</button>`;
  }

  function renderNode(target) {
    const isHi = resolved.kind === 'node' && resolved.value === target;
    const cls = ['cb-node', isHi ? HI_CLASS : ''].filter(Boolean).join(' ');
    return `<li><button type="button" class="${cls}" data-target="${target}">${target}</button></li>`;
  }

  function renderMarkup() {
    if (!tabs.length) {
      return `<div class="codebook codebook-empty"><p>No ${mode === 'osha' ? 'OSHA' : 'NEC'} tabs loaded.</p></div>`;
    }
    const groups = groupByPillar(tabs);
    const tabStrip = groups
      .map(
        (g) => `
      <div class="cb-pillar-group">
        <span class="cb-pillar-label">${pillarLabel(mode, g.pillar)}</span>
        <div class="cb-pillar-tabs">${g.tabs.map(renderTabButton).join('')}</div>
      </div>`
      )
      .join('');

    const active = activeIndex >= 0 ? tabs[activeIndex] : null;
    const footnoteHi = resolved.kind === 'footnote' ? HI_CLASS : '';

    return `
      <div class="codebook" data-mode="${mode}">
        <p class="codebook-lede">${mode === 'osha' ? 'OSHA parts (mock)' : 'NEC tab kit (mock)'} — tab labels and section numbers only. Verify every value against your book.</p>
        <div class="codebook-tabs" role="tablist">${tabStrip}</div>
        <div class="codebook-tree">
          <p class="cb-tree-heading">${active ? active.label : 'Select a tab'}</p>
          <ul class="cb-tree-list">${active ? active.targets.map(renderNode).join('') : ''}</ul>
        </div>
        <div class="codebook-footnote">
          <button type="button" class="cb-footnote-btn ${footnoteHi}" data-target="${FOOTNOTE_ID}">
            <span class="cb-footnote-label">Footnote zone</span>
            <span class="cb-footnote-text">${footnoteStrategy(mode)}</span>
          </button>
        </div>
      </div>`;
  }

  function bind() {
    root.querySelectorAll('[data-tab-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.tabIndex);
        activeIndex = index;
        onPick(tabs[index].label);
        render();
      });
    });
    root.querySelectorAll('.cb-node').forEach((btn) => {
      btn.addEventListener('click', () => onPick(btn.dataset.target));
    });
    const footnoteBtn = root.querySelector('.cb-footnote-btn');
    if (footnoteBtn) footnoteBtn.addEventListener('click', () => onPick(FOOTNOTE_ID));
  }

  function render() {
    root.innerHTML = renderMarkup();
    bind();
  }

  render();
}
