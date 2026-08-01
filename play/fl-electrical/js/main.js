import { loadProgress, saveProgress, mutateProgress, markStarted } from './progress.js';
import { renderChecklist } from './checklist.js';
import { openIntro } from './intro.js';
import { renderPath } from './screens/path.js';
import { renderBookMap } from './screens/bookmap.js';

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
  const KEY = manifest.storageKey;
  document.getElementById('rail').innerHTML = SCREENS.map((s) =>
    `<button type="button" data-screen="${s}" class="rail-btn">${s}</button>`
  ).join('');

  const [checklist, books, kit, path] = await Promise.all([
    loadJSON('data/checklist.json'),
    loadJSON('data/books.json'),
    loadJSON('data/kit.json'),
    loadJSON('data/path.json'),
  ]);

  const sidebar = document.getElementById('sidebar');
  const rail = document.getElementById('rail');
  const screenRoot = document.getElementById('screen');
  const introRoot = document.getElementById('intro-root');

  // Consumed by renderScreen('bookmap') the next time it runs, then cleared —
  // set by the sidebar's per-book info button (onOpenBook below) so that
  // flow can jump straight to a book's flyer instead of just the bare grid.
  let pendingBookOpen = null;

  function renderSidebar() {
    const progress = loadProgress(KEY);
    document.getElementById('xp').textContent = `XP ${progress.xp}`;
    renderChecklist(sidebar, {
      checklist,
      books,
      kit,
      progress,
      onToggle(itemId, checked, { compartmentId }) {
        mutateProgress(KEY, (p) => {
          p.checklist[itemId] = checked;
          if (checked && (compartmentId === 'B' || compartmentId === 'C')) {
            p.kitTouched = true;
          }
          return p;
        });
        renderSidebar();
      },
      onOpenBook(bookId) {
        // Jump to the Book Map screen and pop that book's hotspot flyer open
        // immediately — go() re-gates through the intro if !started, same as
        // any other rail navigation, so this can't bypass the lock.
        pendingBookOpen = bookId;
        go('bookmap');
      },
    });
  }

  // Rail lock gate: distinct from the intro-dismiss gate (see intro.js). The
  // rail unlocks ONLY on `started` — a kit tick alone (kitTouched) can close
  // the intro modal, but must NOT let the visitor into study screens.
  function updateRailLocks(p) {
    rail.querySelectorAll('[data-screen]').forEach((btn) => {
      btn.disabled = !p.started && btn.dataset.screen !== 'path';
    });
  }

  function updateRailActive(screen) {
    rail.querySelectorAll('[data-screen]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.screen === screen);
    });
  }

  // Scope guard: 'path' and 'bookmap' are real screens now. walkthrough/
  // trainer/timed (later tasks) still get a placeholder so the router never
  // crashes on a screen id with no module yet.
  function renderScreen(screen) {
    if (screen === 'path') {
      renderPath(screenRoot, { path, onShowIntro: openIntroNow });
      return;
    }
    if (screen === 'bookmap') {
      const openBookId = pendingBookOpen;
      pendingBookOpen = null;
      renderBookMap(screenRoot, {
        books,
        progress: loadProgress(KEY),
        openBookId,
        onToggleSkimmed(checked) {
          mutateProgress(KEY, (p) => {
            p.checklist['e-map'] = checked;
            return p;
          });
          renderSidebar();
        },
      });
      return;
    }
    const label = screen.charAt(0).toUpperCase() + screen.slice(1);
    screenRoot.innerHTML = `
      <div class="screen-soon">
        <h2>${label}</h2>
        <p>Coming soon &mdash; this lane lands in a later build task.</p>
      </div>`;
  }

  // Router guard. `!started` blocks every screen except 'path' — clicking a
  // locked rail button (or any programmatic go() to a locked screen) forces
  // the intro back open instead of rendering. `path` itself is never gated,
  // so a fresh visitor (or one who only ticked a kit item) can always read
  // it without ever touching Start studying.
  function go(screen) {
    const p = loadProgress(KEY);
    if (!p.started && screen !== 'path') {
      openIntroNow();
      return;
    }
    p.lastScreen = screen;
    saveProgress(KEY, p);
    renderScreen(screen);
    updateRailLocks(p);
    updateRailActive(screen);
  }

  function openIntroNow() {
    openIntro(introRoot, {
      path,
      // Live getter, not a snapshot: the sidebar checklist stays clickable
      // behind this overlay (styles.css `.intro-backdrop` is pointer-events:
      // none except over `.intro-card`), so Skip must see a kit tick that
      // happened after openIntro was called.
      progress: () => loadProgress(KEY),
      onStart() {
        markStarted(KEY);
        mutateProgress(KEY, (p) => {
          p.pathComplete = true;
          return p;
        });
        renderSidebar();
        go(loadProgress(KEY).lastScreen);
      },
      onSkip() {
        // "Session dismiss" — closing the modal here never unlocks the rail,
        // and (per constraints.md) this branch of intro.js only ever calls
        // onSkip when canDismissIntro was already true, so this can't be
        // used to fabricate a bypass for a fresh, zero-tick visitor.
        mutateProgress(KEY, (p) => {
          p.introDismissedSession = true;
          return p;
        });
        updateRailLocks(loadProgress(KEY));
      },
    });
  }

  rail.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-screen]');
    if (!btn || btn.disabled) return;
    go(btn.dataset.screen);
  });

  document.getElementById('btn-intro').addEventListener('click', openIntroNow);

  renderSidebar();
  mountMobileSidebarToggle();

  // Boot: `go(lastScreen)` alone covers both cases — when `!started`,
  // `lastScreen` is guaranteed to still be 'path' (go() only ever persists a
  // non-path lastScreen once started is true), so it renders the Path screen
  // and locks the rail exactly like a direct 'path' navigation would. Then,
  // if the visitor hasn't started, force the intro open on top of that.
  const initialProgress = loadProgress(KEY);
  go(initialProgress.lastScreen);
  if (!initialProgress.started) {
    openIntroNow();
  }

  console.info('fl-electrical boot', manifest.id);
}
boot();
