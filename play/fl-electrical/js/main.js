import { loadProgress, mutateProgress } from './progress.js';
import { renderChecklist } from './checklist.js';

// GitHub Pages has no bundler — load ALL JSON via fetch (no import-attributes, which Pages won't serve).
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path);
  return r.json();
}

const SCREENS = ['path', 'bookmap', 'walkthrough', 'trainer', 'timed'];

// Mobile sidebar sheet: created here (not in index.html) so Task 3 stays
// inside its file list. `#btn-checklist` (mobile-only, Task 1) toggles it;
// a backdrop click closes it.
function mountMobileSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-checklist');
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);

  function close() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  }
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
  });
  backdrop.addEventListener('click', close);
}

export async function boot() {
  const manifest = await loadJSON('data/manifest.json');
  document.getElementById('rail').innerHTML = SCREENS.map((s) =>
    `<button type="button" data-screen="${s}" class="rail-btn">${s}</button>`
  ).join('');

  const [checklist, books, kit] = await Promise.all([
    loadJSON('data/checklist.json'),
    loadJSON('data/books.json'),
    loadJSON('data/kit.json'),
  ]);

  const sidebar = document.getElementById('sidebar');

  function renderSidebar() {
    const progress = loadProgress(manifest.storageKey);
    document.getElementById('xp').textContent = `XP ${progress.xp}`;
    renderChecklist(sidebar, {
      checklist,
      books,
      kit,
      progress,
      onToggle(itemId, checked, { compartmentId }) {
        mutateProgress(manifest.storageKey, (p) => {
          p.checklist[itemId] = checked;
          if (checked && (compartmentId === 'B' || compartmentId === 'C')) {
            p.kitTouched = true;
          }
          return p;
        });
        renderSidebar();
      },
      onOpenBook(bookId) {
        // Task 5 (Book Map) wires the real detail flyer; no-op hook for now.
        console.debug('fl-electrical: open book', bookId);
      },
    });
  }
  renderSidebar();
  mountMobileSidebarToggle();

  // Task 4 wires the intro gate + router guard.
  console.info('fl-electrical boot', manifest.id);
}
boot();
