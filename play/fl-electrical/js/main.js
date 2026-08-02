import { loadProgress, saveProgress, mutateProgress, markStarted, resetProgress } from './progress.js';
import { initToasts, toast, resetToastOnce, clearToasts } from './toast.js';
import { runTour, coachSeen, coachReset, closeCoachmark } from './coachmark.js';
import { renderChecklist } from './checklist.js';
import { openIntro } from './intro.js';
import { openSettings } from './settings.js';
import { renderPath } from './screens/path.js';
import { renderBookMap } from './screens/bookmap.js';
import { renderWalkthrough, trainerTopicUnlockKey } from './screens/walkthrough.js';
import { renderTrainer, OSHA_LANE_UNLOCK, CLEAR_THRESHOLD, isOshaLaneUnlocked } from './screens/trainer.js';
import { renderTimed, isTimedUnlocked } from './screens/timed.js';

// GitHub Pages has no bundler — load ALL JSON via fetch (no import-attributes, which Pages won't serve).
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path);
  return r.json();
}

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

  // Clean slate on a new release. The guided flow changed substantially, so a
  // returning visitor's old saved state (started=true, tour already seen) would
  // skip the refreshed intro + first-visit site tour. This clears prior progress
  // and the show-once guide flags ONCE per release per browser, so everyone hits
  // the same fresh starting point here. Bump RELEASE to re-trigger.
  const RELEASE = '2026-08-01-finder';
  try {
    if (localStorage.getItem('fl-electrical-release') !== RELEASE) {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('fl-electrical') || k.startsWith('fl-coach-once:') || k.startsWith('fl-toast-once:'))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('fl-electrical-release', RELEASE);
    }
  } catch (_) { /* storage blocked — nothing to reset */ }

  // The four Art. 250 topic ids are shared by contract across the walkthrough
  // AND trainer screens (a walkthrough's id doubles as its trainer topic id).
  // Task 9 adds the OSHA topic ids to the SAME generic id-driven loader below
  // — nothing about the loading/indexing code is NEC-specific, so the OSHA
  // topics just ride along once their id is in this combined list.
  const NEC_TOPIC_IDS = ['nec-250-gec', 'nec-250-122', 'nec-250-122b', 'nec-250-traps'];
  const OSHA_TOPIC_IDS = ['osha-falls', 'osha-ladders'];
  const TOPIC_IDS = [...NEC_TOPIC_IDS, ...OSHA_TOPIC_IDS];
  const [
    checklist, books, kit, path, necTabs, oshaTabs, timedMiniFile,
    necIndex, oshaIndex, necContents, oshaContents,
    ...topicData
  ] = await Promise.all([
    loadJSON('data/checklist.json'),
    loadJSON('data/books.json'),
    loadJSON('data/kit.json'),
    loadJSON('data/path.json'),
    loadJSON('data/tabs/nec-curated.json'),
    loadJSON('data/tabs/osha-curated.json'),
    loadJSON('data/drills/timed-mini.json'),
    loadJSON('data/index/nec.json'),
    loadJSON('data/index/osha.json'),
    loadJSON('data/contents/nec.json'),
    loadJSON('data/contents/osha.json'),
    ...TOPIC_IDS.map((id) => loadJSON(`data/walkthroughs/${id}.json`)),
    ...TOPIC_IDS.map((id) => loadJSON(`data/drills/${id}.json`)),
  ]);
  const walkthroughs = topicData.slice(0, TOPIC_IDS.length);
  const drillFiles = topicData.slice(TOPIC_IDS.length);
  // Timed mini-set (Task 10): a fixed, mixed-lane subset of the SAME drill
  // schema — each item keeps its original topic id, so timed.js can derive
  // book/edition-pin per item without a second lookup table.
  const timedDrills = timedMiniFile.drills;

  // tabsByBook: the codebook mock needs a DIFFERENT tab set per book ('nec' vs
  // 'osha') — walkthrough.js/trainer.js pick the right one per-topic off each
  // walkthrough's own `book` field (never hardcoded to 'nec' anymore).
  const tabsByBook = { nec: necTabs.tabs, osha: oshaTabs.tabs };

  // indexByBook/contentsByBook: the same per-book split as tabsByBook, for the
  // codebook mock's Index/Contents views (js/codebook-mock.js, Tasks 6-7).
  // Threaded into the screens below; the screens themselves forward whichever
  // book's map applies into mountCodebook (Task 9).
  const indexByBook = { nec: necIndex, osha: oshaIndex };
  const contentsByBook = { nec: necContents, osha: oshaContents };

  // drillsByTopic: { topicId: drill[] } for the Trainer picker/player.
  // drillIdToTopic: id -> topic, so the scoring handler can count DISTINCT
  // correct drills per topic without re-scanning every file on each answer.
  const drillsByTopic = {};
  const drillIdToTopic = {};
  drillFiles.forEach((file) => {
    drillsByTopic[file.topic] = file.drills;
    file.drills.forEach((d) => { drillIdToTopic[d.id] = d.topic; });
  });
  // Trainer reuses the walkthrough titles (ids match by contract — one title
  // source, no drift). `book` rides along so the trainer picker/player can
  // gate OSHA cards on the lane unlock and mount the right codebook mode.
  const trainerTopicsMeta = walkthroughs.map((w) => ({ id: w.id, title: w.title, book: w.book }));
  const topicTitleById = {};
  trainerTopicsMeta.forEach((t) => { topicTitleById[t.id] = t.title; });

  const sidebar = document.getElementById('sidebar');
  const rail = document.getElementById('rail');
  const screenRoot = document.getElementById('screen');
  const introRoot = document.getElementById('intro-root');
  const settingsRoot = document.getElementById('settings-root');

  // Tracks which screen is showing so renderRail() can re-mark the active tab
  // after it rebuilds the rail (e.g. when Timed appears mid-session).
  let currentScreen = loadProgress(KEY).lastScreen || 'path';

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
  // 'timed' carries a SECOND, independent lock on top of that: it stays
  // disabled until trainerTopicClears.length reaches the manifest's
  // combined-clears target (constraints.md — gate on clears, never raw
  // trainerCorrectCount). timed.js's own isTimedUnlocked() re-derives this
  // exact check defensively inside the screen itself.
  // Why a rail screen is locked, or null if it's open. One source of truth for
  // both the visual lock (updateRailLocks) and the explanatory toast the click
  // handler fires — they can never drift.
  function railLockReason(p, screen) {
    if (screen === 'path') return null;
    if (!p.started) return 'notStarted';
    return null;
  }

  // The rail shows the four core screens always; Timed is HIDDEN until it
  // unlocks (its own second gate: trainerTopicClears reaches the manifest's
  // combined-clears target). Hiding the locked tab — rather than showing a
  // greyed lock button — is the owner's call (constraints.md gates on clears).
  function visibleScreens() {
    const p = loadProgress(KEY);
    const screens = ['path', 'bookmap', 'walkthrough', 'trainer'];
    if (isTimedUnlocked(p, manifest.unlock.trainerClearsForTimed)) screens.push('timed');
    return screens;
  }

  // Rebuilds the rail from the currently-visible screens. Safe to call any time:
  // the click handler is delegated on #rail (not per-button), so replacing its
  // innerHTML keeps navigation working. Called on boot and whenever a Timed
  // unlock crosses the threshold, so the new tab appears immediately.
  function renderRail() {
    rail.innerHTML = visibleScreens().map((s) =>
      `<button type="button" data-screen="${s}" class="rail-btn">${s}</button>`
    ).join('');
    updateRailLocks(loadProgress(KEY));
    updateRailActive(currentScreen);
  }

  // Locked rail buttons stay genuinely ENABLED (not `disabled`, not
  // aria-disabled) so every input path — mouse, keyboard, assistive tech —
  // can activate them and hear the "here's how to unlock" toast; marking them
  // aria-disabled would tell AT they're off-limits and the explanation would
  // never reach a screen-reader user. The .locked class dims them and adds a
  // 🔒 glyph (CSS generated content, which folds into the accessible name, so
  // the locked state is still announced). go()'s router guard + timed.js's
  // renderLocked remain the real gates against a slipped-through navigation.
  function updateRailLocks(p) {
    rail.querySelectorAll('[data-screen]').forEach((btn) => {
      const reason = railLockReason(p, btn.dataset.screen);
      btn.disabled = false;
      btn.classList.toggle('locked', !!reason);
    });
  }

  function updateRailActive(screen) {
    rail.querySelectorAll('[data-screen]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.screen === screen);
    });
  }

  // The Book Map's first-visit pointer, also fired by its "Replay guide" button.
  function showBookmapPointer() {
    const firstCard = screenRoot.querySelector('.bookcard');
    if (!firstCard) return;
    runTour([{
      target: firstCard,
      title: 'Read the key test points',
      body: 'Click any book card to open its high-yield topics: the questions the exam pulls from that book, why they matter, and the traps to watch.',
      doneLabel: 'Got it',
    }]);
  }

  // First-visit SITE tour — fires once, right after Start studying, to orient
  // the whole app: the four core rail tabs, then the prep checklist, then
  // Settings. Distinct from the per-screen tours (the Book Map card pointer and
  // the Trainer lookup tour), which still fire on their own screens. Shown once
  // via coachSeen('site-tour'); Settings → Replay tips clears the flag to replay.
  function startSiteTour() {
    if (coachSeen('site-tour')) return;
    const railBtn = (s) => () => rail.querySelector(`[data-screen="${s}"]`);
    const mobile = window.matchMedia('(max-width: 900px)').matches;
    runTour([
      { target: railBtn('path'), title: 'Path (start here)',
        body: 'The exam is open-book, so your score is really how fast you find answers. This tab holds the plan, the ROI map of where the questions live, and your book list.' },
      { target: railBtn('bookmap'), title: 'Book Map',
        body: 'Every reference book, and the high-yield topics inside each one: what the exam pulls from each book, and the traps to watch.' },
      { target: railBtn('walkthrough'), title: 'Walkthrough',
        body: 'Guided reps of the search path: noun, tab, table, footnote. The same moves every time, until they’re automatic.' },
      { target: railBtn('trainer'), title: 'Trainer',
        body: 'Answer on the left, look it up on the right. Being fast at finding is the whole game. Clear topics here to open the OSHA and Timed lanes.' },
      { target: () => (mobile
          ? document.getElementById('btn-checklist')
          : (document.querySelector('#sidebar .checklist') || document.getElementById('sidebar'))),
        title: 'Your prep checklist',
        body: mobile
          ? 'Tap Checklist to open your prep list: books to order, tabs, exam-day rules, and your live study progress. It ticks itself as you go.'
          : 'Your prep checklist: books to order, tabs, exam-day rules, and your live study progress. It ticks itself as you go.' },
      { target: () => document.getElementById('btn-settings'), title: 'Settings',
        body: 'Replay this tour, re-open the intro, or reset your progress any time.',
        doneLabel: 'Got it' },
    ]);
  }

  // All five screens are real now (Task 10 finished 'timed'). The fallback
  // at the bottom of this function stays only as a defensive default for an
  // unrecognized screen id — it should never actually be reached.
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
        onReplayGuide: showBookmapPointer,
      });
      // First-visit pointer at a book card (skipped when we deep-linked into a
      // flyer). The "Replay guide" button re-fires the same pointer any time.
      if (!openBookId && !coachSeen('bookmap-cards')) showBookmapPointer();
      return;
    }
    if (screen === 'walkthrough') {
      renderWalkthrough(screenRoot, {
        topics: walkthroughs,
        tabsByBook,
        indexByBook,
        contentsByBook,
        isOshaUnlocked: isOshaLaneUnlocked,
        getProgress: () => loadProgress(KEY),
        onComplete(topicId) {
          mutateProgress(KEY, (p) => {
            if (!p.completedWalkthroughs.includes(topicId)) {
              p.completedWalkthroughs.push(topicId);
              p.xp += manifest.xp.walkthrough;
            }
            const unlockKey = trainerTopicUnlockKey(topicId);
            if (!p.unlocked.includes(unlockKey)) {
              p.unlocked.push(unlockKey);
            }
            return p;
          });
          renderSidebar();
        },
      });
      return;
    }
    if (screen === 'trainer') {
      renderTrainer(screenRoot, {
        topicsMeta: trainerTopicsMeta,
        drillsByTopic,
        tabsByBook,
        indexByBook,
        contentsByBook,
        editionPins: manifest.editionPins,
        oshaUnlockTarget: manifest.unlock.trainerTopicsForOsha,
        getProgress: () => loadProgress(KEY),
        onResult: onTrainerResult,
      });
      return;
    }
    if (screen === 'timed') {
      renderTimed(screenRoot, {
        drills: timedDrills,
        tabsByBook,
        editionPins: manifest.editionPins,
        unlockTarget: manifest.unlock.trainerClearsForTimed,
        getProgress: () => loadProgress(KEY),
        onAttemptStart: onTimedAttemptStart,
        onResult: onTimedResult,
      });
      return;
    }
    const label = screen.charAt(0).toUpperCase() + screen.slice(1);
    screenRoot.innerHTML = `
      <div class="screen-soon">
        <h2>${label}</h2>
        <p>Coming soon. This lane lands in a later build task.</p>
      </div>`;
  }

  // Trainer scoring — owns ALL storage mutation for a drill result (the
  // trainer screen itself never touches localStorage). Returns the fresh
  // progress so the trainer can render "topic cleared" / "OSHA unlocked".
  //
  //   correct  → trainerCorrectCount++ (lifetime tally) + trainerCorrect XP;
  //              + trainerPathBonus XP when the lookup path was hit; the drill
  //              id joins trainerCorrectDrills (deduped). A topic CLEARS at
  //              CLEAR_THRESHOLD distinct correct drills → trainerTopicClears.
  //              Three cleared nec-250 topics record OSHA_LANE_UNLOCK.
  //   wrong    → a missLog entry { stemId, yourPath, correctPath, elapsed }.
  function onTrainerResult({ drill, correct, lookupHit, pickedPath, elapsed }) {
    const timedTarget = manifest.unlock.trainerClearsForTimed;
    const before = loadProgress(KEY);
    const beforeClears = (before.trainerTopicClears || []).slice();
    const beforeOsha = (before.unlocked || []).includes(OSHA_LANE_UNLOCK);
    const beforeTimed = isTimedUnlocked(before, timedTarget);
    const next = mutateProgress(KEY, (p) => {
      if (correct) {
        p.trainerCorrectCount += 1;
        p.xp += manifest.xp.trainerCorrect;
        if (lookupHit) p.xp += manifest.xp.trainerPathBonus;

        if (!Array.isArray(p.trainerCorrectDrills)) p.trainerCorrectDrills = [];
        if (!p.trainerCorrectDrills.includes(drill.id)) p.trainerCorrectDrills.push(drill.id);

        // Distinct correct drills IN THIS topic — gate on this, never the raw
        // trainerCorrectCount (constraints.md).
        const topicCorrect = p.trainerCorrectDrills.filter((id) => drillIdToTopic[id] === drill.topic).length;
        if (topicCorrect >= CLEAR_THRESHOLD && !p.trainerTopicClears.includes(drill.topic)) {
          p.trainerTopicClears.push(drill.topic);
        }

        // OSHA lane unlocks at 3 cleared Art. 250 topics.
        const nec250Clears = p.trainerTopicClears.filter((t) => t.startsWith('nec-250')).length;
        if (nec250Clears >= manifest.unlock.trainerTopicsForOsha && !p.unlocked.includes(OSHA_LANE_UNLOCK)) {
          p.unlocked.push(OSHA_LANE_UNLOCK);
        }
      } else {
        p.missLog.push({
          stemId: drill.id,
          yourPath: pickedPath,
          correctPath: drill.lookupPath || [],
          elapsed,
        });
      }
      return p;
    });
    renderSidebar();
    // A trainer clear can be the 5th COMBINED clear that unlocks Timed — it is
    // HIDDEN until then, so re-render the rail to make the new tab appear the
    // instant that threshold is crossed, not only on the next navigation.
    renderRail();

    // Milestone toasts — the trainer's result card already shows an inline
    // banner for a clear / OSHA-unlock; these add the cross-screen
    // acknowledgment, and for Timed they are the ONLY signal a new lane opened
    // (the trainer card never mentions Timed).
    if (correct) {
      const newClears = (next.trainerTopicClears || []).filter((t) => !beforeClears.includes(t));
      newClears.forEach((t) => toast(`Topic cleared · ${topicTitleById[t] || t}`, { type: 'win' }));
      if (!beforeOsha && (next.unlocked || []).includes(OSHA_LANE_UNLOCK)) {
        toast('OSHA lane unlocked. Three Art. 250 topics cleared. New topics are waiting in the Walkthrough + Trainer.', { type: 'win' });
      }
      if (!beforeTimed && isTimedUnlocked(next, timedTarget)) {
        toast('Timed mini-set unlocked. You’ve cleared 5 topics. Ready for a real timed run?', {
          type: 'win',
          action: { label: 'Open Timed', onClick: () => go('timed') },
        });
      }
    }
    return next;
  }

  // Timed scoring (Task 10) — separate from onTrainerResult on purpose: the
  // Timed lane doesn't feed trainerTopicClears/trainerCorrectDrills (those
  // already gated its own unlock; replaying the same drill ids here must not
  // re-trigger clears or double-count the lifetime trainer tally). It owns
  // exactly two things: the manifest's own-lane XP bonus, and missLog
  // entries in the SAME {stemId, yourPath, correctPath, elapsed} shape
  // trainer misses use (timed.js's `timedOut` flag doesn't need its own
  // branch here — an unanswered timeout is scored `correct: false` already,
  // so it falls into the same miss-push path as a wrong pick).
  function onTimedAttemptStart() {
    mutateProgress(KEY, (p) => {
      p.timedAttempted = true;
      return p;
    });
    renderSidebar();
  }

  function onTimedResult({ drill, correct, elapsed, pickedPath }) {
    const next = mutateProgress(KEY, (p) => {
      if (correct) {
        if (elapsed <= drill.timeTargetSec) {
          p.xp += manifest.xp.timedUnderTarget;
        }
      } else {
        p.missLog.push({
          stemId: drill.id,
          yourPath: pickedPath,
          correctPath: drill.lookupPath || [],
          elapsed,
        });
      }
      return p;
    });
    renderSidebar();
    return next;
  }

  // Router guard. `!started` blocks every screen except 'path' — clicking a
  // locked rail button (or any programmatic go() to a locked screen) forces
  // the intro back open instead of rendering. `path` itself is never gated,
  // so a fresh visitor (or one who only ticked a kit item) can always read
  // it without ever touching Start studying.
  function go(screen) {
    closeCoachmark(); // any open first-run walkthrough ends when we navigate
    clearToasts(); // wipe the previous screen's banners so they don't stack up
    const p = loadProgress(KEY);
    if (!p.started && screen !== 'path') {
      openIntroNow();
      return;
    }
    currentScreen = screen;
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
        // First-visit orientation: highlight the rail, checklist, and settings.
        // Runs once (coachSeen); go() already rendered the screen + rail beneath.
        startSiteTour();
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

  // Settings overlay (top-bar button). The Path screen already carries the
  // intro material, so the top button houses options instead: re-open the
  // intro, replay the first-visit screen tips, reset progress, and future
  // toggles. Reset lives HERE now (moved off the intro modal).
  function openSettingsNow() {
    openSettings(settingsRoot, {
      onReset: onResetProgress,
      onReplayTips() {
        coachReset();
        resetToastOnce();
        // Relaunch the site tour now; the per-screen guides re-fire on their own
        // screens as you navigate. If somehow not started yet, it runs right
        // after Start studying instead.
        if (loadProgress(KEY).started) startSiteTour();
        else toast('Guided tour reset. It will run when you start studying.', { type: 'info' });
      },
      onShowIntro: openIntroNow,
    });
  }

  // Hidden/advanced reset (design §3.1) — "Reset progress" under Show intro,
  // confirm-gated, for testing / starting a new exam cycle. Reuses the same
  // boot/render path the app already has (renderSidebar + go + openIntroNow)
  // instead of duplicating boot() — since none of the loaded JSON depends on
  // progress, re-rendering the progress-dependent DOM is all a "reboot" needs.
  function onResetProgress() {
    if (!confirm('Reset all exam-prep progress? This clears your checklist, XP, and unlocks.')) return;
    resetProgress(KEY);
    resetToastOnce(); // let the first-visit nudges fire again — a true clean slate
    coachReset(); // and the first-run walkthroughs
    renderSidebar();
    go('path');
    openIntroNow();
  }

  rail.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-screen]');
    if (!btn) return;
    const screen = btn.dataset.screen;
    const p = loadProgress(KEY);
    const reason = railLockReason(p, screen);
    if (reason === 'notStarted') {
      // The intro IS the explanation for the started-gate — reopen it.
      openIntroNow();
      return;
    }
    go(screen);
  });

  document.getElementById('btn-settings').addEventListener('click', openSettingsNow);

  initToasts();
  renderSidebar();
  renderRail();
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
