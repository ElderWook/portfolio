// js/screens/bookmap.js — the Book Map screen: a grid of the 14 UE books
// with priority badges + ROI signal (examSubject/weightRange), plus a
// click-through detail flyer of book-specific hotspot topics.
//
// Hotspot files (data/hotspots/<id>.json) are fetched lazily per card click
// rather than preloaded on boot — 14 extra fetches at startup would slow
// every screen down for content only the Book Map needs.
//
// "Trainer: live" is reserved for the two books this beta's Trainer screen
// (Task 8) actually drills — NEC (Art. 250 topics) and OSHA. Every other
// book shows "Trainer: coming" since no drill content exists for it yet.
// Keep this set in sync with the Trainer screen's real topic coverage.
const LIVE_TRAINER_BOOKS = new Set(['nec', 'osha']);

async function loadHotspots(bookId) {
  const r = await fetch(`data/hotspots/${bookId}.json`);
  if (!r.ok) throw new Error(`hotspots/${bookId}.json`);
  return r.json();
}

function trainerTag(bookId) {
  return LIVE_TRAINER_BOOKS.has(bookId)
    ? '<span class="badge badge-ok">Trainer: live</span>'
    : '<span class="badge badge-soon">Trainer: coming</span>';
}

function renderCard(book) {
  const nowBadge = book.priority === 'now' ? '<span class="badge badge-now">Need now</span>' : '';
  return `
    <button type="button" class="bookcard" data-book="${book.id}">
      <div class="bookcard-head">
        ${nowBadge}
        ${trainerTag(book.id)}
      </div>
      <h3>${book.title}</h3>
      <p class="bookcard-cib">${book.cibCode} &middot; ed. ${book.edition}</p>
      <p class="bookcard-subject">${book.examSubject}</p>
      <p class="bookcard-weight">${book.weightRange} Q on exam</p>
    </button>`;
}

function renderHotspot(h) {
  const nouns = (h.searchNouns || []).map((n) => `<span class="chip">${n}</span>`).join('');
  return `
    <li class="hotspot">
      <h4>${h.topic}</h4>
      <p>${h.whyItMatters}</p>
      ${nouns ? `<div class="hotspot-nouns">${nouns}</div>` : ''}
      <p class="hotspot-cite"><span class="cite-label">Cite</span> ${h.cite}</p>
      <p class="hotspot-trap"><span class="trap-label">Trap</span> ${h.trap}</p>
    </li>`;
}

function renderFlyer(root, book, data) {
  const items = (data.hotspots || []).map(renderHotspot).join('');
  root.innerHTML = `
    <div class="flyer-backdrop" id="flyer-backdrop">
      <div class="flyer-card" role="dialog" aria-modal="true" aria-labelledby="flyer-title">
        <div class="flyer-headrow">
          <h2 id="flyer-title">${book.title}</h2>
          <button type="button" class="nav ghost" id="flyer-close" aria-label="Close">Close</button>
        </div>
        <p class="flyer-meta">${book.cibCode} &middot; ed. ${book.edition} ${trainerTag(book.id)}</p>
        <ul class="hotspot-list">${items || '<li class="hotspot-empty">No hotspots recorded for this book yet.</li>'}</ul>
      </div>
    </div>`;
  root.hidden = false;

  function close() {
    root.hidden = true;
    root.innerHTML = '';
  }
  root.querySelector('#flyer-close').addEventListener('click', close);
  root.querySelector('#flyer-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'flyer-backdrop') close();
  });
}

export function renderBookMap(root, { books, progress, onToggleSkimmed, openBookId }) {
  const skimmed = progress.checklist['e-map'] === true;
  root.innerHTML = `
    <section class="bookmap-screen">
      <h2>Book Map</h2>
      <p class="bookmap-lede">All 14 UE reference books. "Need now" is what to order first; the rest can wait until closer to exam day. Click a card for its high-yield topics.</p>
      <label class="bookmap-skim">
        <input type="checkbox" id="bookmap-skimmed" ${skimmed ? 'checked' : ''}>
        <span>Book Map skimmed</span>
      </label>
      <div class="bookmap-grid">${books.books.map(renderCard).join('')}</div>
    </section>
    <div id="bookmap-flyer" hidden></div>`;

  root.querySelector('#bookmap-skimmed').addEventListener('change', (e) => {
    onToggleSkimmed(e.target.checked);
  });

  const flyerRoot = root.querySelector('#bookmap-flyer');

  async function openBook(bookId) {
    const book = books.books.find((b) => b.id === bookId);
    if (!book) return;
    try {
      const data = await loadHotspots(bookId);
      renderFlyer(flyerRoot, book, data);
    } catch (err) {
      console.error('fl-electrical: hotspot load failed', bookId, err);
    }
  }

  root.querySelectorAll('[data-book]').forEach((card) => {
    card.addEventListener('click', () => openBook(card.dataset.book));
  });

  // Deep-link from the sidebar's per-book info button (main.js onOpenBook):
  // land on the grid already showing that book's flyer.
  if (openBookId) openBook(openBookId);
}
