// js/screens/trainer.js — Trainer engine: a dual-pane drill player for the
// four Art. 250 topics PLUS (Task 9) the OSHA topics once their lane
// unlocks. LEFT pane = the question (stem, choices, a countdown timer ring,
// a 3-rung hint ladder, submit). RIGHT pane = the shared codebook mock
// (js/codebook-mock.js) in the topic's own book mode ('nec' or 'osha'), so
// the visitor practices the SAME look-it-up habit the walkthrough taught.
//
// CITE-ONLY (constraints.md): the drill JSON (data/drills/nec-250-*.json,
// data/drills/osha-*.json) stores section/table NUMBERS and a search METHOD
// only — never a cmil area, an AWG size, an ampacity, or (OSHA) a trigger
// height/ratio/reporting clock. The "correct" choice states the METHOD ("read
// the aluminum column of Table 250.122"), not a value. Scenario inputs like
// "#12 to #8 Cu" or "20A OCPD" are lookup KEYS and are fine.
//
// HARD DRILLS (`hard: true`): a correct answer is ACCEPTED only if the visitor
// also clicked a codebook node/tab that matches one of the drill's lookupPath
// entries (the point of the drill is to force the lookup). A correct answer
// without the lookup is HELD (an inline nudge, no scoring) so they can go do
// it and resubmit — it is NOT counted as a miss.
//
// SCORING lives in main.js (this module never touches storage — same pattern
// as walkthrough.js/path.js/bookmap.js). On submit this calls back:
//   onResult({ drill, correct, lookupHit, pickedPath, elapsed }) -> freshProgress
// main.js owns the trainerCorrectCount / XP / path-bonus / distinct-correct
// topic-clear / OSHA-lane-unlock / missLog mutation and returns the updated
// progress so this screen can show "topic cleared" / "OSHA unlocked" banners.
//
// UNLOCK: a Trainer topic is playable only once its walkthrough set
// `trainer-topic:<id>` in progress.unlocked (isTrainerTopicUnlocked, imported
// from walkthrough.js). Clearing three nec-250 topics records OSHA_LANE_UNLOCK
// in progress.unlocked — Task 9's OSHA lane reads that signal.

import { mountCodebook } from '../codebook-mock.js';
import { isTrainerTopicUnlocked } from './walkthrough.js';
import { runTour, coachSeen } from '../coachmark.js';

// The signal Task 9 (OSHA drills) reads to know its lane is AVAILABLE. Written
// by main.js's scoring handler; declared here so both sides share one string.
// This is deliberately a DIFFERENT signal from isOshaLaneComplete() below —
// "unlocked" fires at 3 nec-250 clears (before any OSHA content is touched);
// "complete" fires once the visitor has actually played the OSHA lane.
export const OSHA_LANE_UNLOCK = 'lane:osha';
export function isOshaLaneUnlocked(progress) {
  return (progress.unlocked || []).includes(OSHA_LANE_UNLOCK);
}

// Task 9: distinct correct OSHA drills required, on top of finishing at least
// one OSHA walkthrough, to mark the whole OSHA lane COMPLETE (checklist.json
// `e-osha`, auto id 'osha-lane-complete' — see checklist.js's isAutoDone,
// which imports isOshaLaneComplete from here rather than re-deriving it).
// OSHA drill ids are authored as `drill-osha-<topic>-<n>` (data/drills/osha-*
// .json), so a simple id-prefix filter finds them without needing the
// topic->book map that only main.js's boot() closure holds.
export const OSHA_DRILLS_FOR_COMPLETE = 3;

export function oshaCorrectDrillCount(progress) {
  return (progress.trainerCorrectDrills || []).filter((id) => id.startsWith('drill-osha-')).length;
}

export function isOshaLaneComplete(progress) {
  const walkthroughDone = (progress.completedWalkthroughs || []).some((id) => id.startsWith('osha-'));
  return walkthroughDone && oshaCorrectDrillCount(progress) >= OSHA_DRILLS_FOR_COMPLETE;
}

// A topic "clears" at this many DISTINCT correct drills (constraints.md: gate
// on clears, never the raw correct tally).
export const CLEAR_THRESHOLD = 2;

// Module-level timer singleton: renderScreen() in main.js swaps
// #screen.innerHTML wholesale on navigation without calling any teardown, so a
// running interval would keep firing against detached nodes. We stop it on
// every drill change/exit AND each tick self-clears if its ring left the DOM.
let activeTimerId = null;
function stopTimer() {
  if (activeTimerId != null) {
    clearInterval(activeTimerId);
    activeTimerId = null;
  }
}

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

function fmtClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

// distinct correct drills the visitor has logged for one topic
function topicCorrectCount(progress, drills) {
  const done = new Set(progress.trainerCorrectDrills || []);
  return drills.filter((d) => done.has(d.id)).length;
}

// OSHA topic cards are REVEALED only once the OSHA lane is unlocked — hidden
// entirely before that (constraints.md), not merely shown-disabled like the
// per-topic 🔒 state below (which is a DIFFERENT, already-visible lock: "this
// topic's own walkthrough isn't done yet").
function visibleTopicsMeta(topicsMeta, progress) {
  return topicsMeta.filter((t) => t.book !== 'osha' || isOshaLaneUnlocked(progress));
}

function renderPicker(root, { topicsMeta, drillsByTopic, progress, oshaUnlockTarget, onSelect }) {
  const nec250Clears = (progress.trainerTopicClears || []).filter((t) => t.startsWith('nec-250')).length;
  const oshaUnlocked = isOshaLaneUnlocked(progress);
  const oshaComplete = isOshaLaneComplete(progress);

  const cards = visibleTopicsMeta(topicsMeta, progress)
    .map((topic) => {
      const drills = drillsByTopic[topic.id] || [];
      const unlocked = isTrainerTopicUnlocked(progress, topic.id);
      const cleared = (progress.trainerTopicClears || []).includes(topic.id);
      const correct = topicCorrectCount(progress, drills);
      const statusIcon = cleared ? '✓' : unlocked ? '○' : '🔒';
      const meta = !unlocked
        ? 'Locked · finish this walkthrough to unlock'
        : cleared
          ? `Cleared · ${correct}/${drills.length} drills correct`
          : `${correct}/${CLEAR_THRESHOLD} correct to clear · ${drills.length} drills`;
      const cls = ['tr-topic-card', cleared ? 'cleared' : '', unlocked ? '' : 'locked'].filter(Boolean).join(' ');
      return `
        <button type="button" class="${cls}" data-topic="${topic.id}" ${unlocked ? '' : 'disabled'}>
          <span class="tr-topic-status" aria-hidden="true">${statusIcon}</span>
          <span class="tr-topic-body">
            <span class="tr-topic-title">${topic.title}</span>
            <span class="tr-topic-meta">${meta}</span>
          </span>
        </button>`;
    })
    .join('');

  const oshaCorrect = oshaCorrectDrillCount(progress);
  const oshaLine = oshaComplete
    ? '<span class="tr-osha-done">OSHA lane complete ✓</span>'
    : oshaUnlocked
      ? `OSHA lane unlocked · <strong>${oshaCorrect}/${OSHA_DRILLS_FOR_COMPLETE}</strong> OSHA drills correct to complete it`
      : `OSHA lane unlocks at ${oshaUnlockTarget} Art. 250 topic clears · <strong>${nec250Clears}/${oshaUnlockTarget}</strong>`;

  root.innerHTML = `
    <section class="trainer-screen">
      <h2>Trainer</h2>
      <p class="tr-lede">Answer on the left, look it up on the right. Hard drills won't accept a right answer until you've opened the cited tab. That's the exam habit. No sizes or table values live here, so verify everything in your book.</p>
      <p class="tr-osha-track">${oshaLine}</p>
      <div class="tr-topic-grid">${cards}</div>
    </section>`;

  root.querySelectorAll('[data-topic]').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => onSelect(btn.dataset.topic));
  });
}

function renderResult(root, ctx) {
  const { drill, topicTitle, index, total, correct, lookupHit, justCleared, justUnlockedOsha, justCompletedOsha, editionPin, onNext, onExit } = ctx;
  const isLast = index + 1 >= total;
  const answerText = drill.choices[drill.answerKey];
  const bonus = correct && lookupHit;
  const ladder = drill.hintLadder.map((h) => `<li>${h}</li>`).join('');

  const banners = [
    justCleared ? '<p class="tr-banner tr-banner-clear">Topic cleared ✓. Two correct drills logged.</p>' : '',
    justUnlockedOsha ? '<p class="tr-banner tr-banner-osha">OSHA lane unlocked. Three Art. 250 topics cleared.</p>' : '',
    justCompletedOsha ? `<p class="tr-banner tr-banner-osha">OSHA lane complete ✓. ${OSHA_DRILLS_FOR_COMPLETE} OSHA drills correct with a walkthrough done.</p>` : '',
  ].join('');

  root.innerHTML = `
    <section class="trainer-screen">
      <div class="tr-headrow">
        <h2>${topicTitle} &middot; Trainer</h2>
        <button type="button" class="nav ghost" id="tr-exit">All topics</button>
      </div>
      <div class="tr-result-card ${correct ? 'ok' : 'miss'}">
        <p class="tr-result-head">${correct ? 'Correct' : 'Not quite'}${bonus ? ' · +lookup bonus' : ''}</p>
        <p class="tr-result-answer"><span class="tr-result-label">Method</span> ${answerText}</p>
        <p class="tr-result-cite">Cite check: this is a lookup, not a memorized value, so confirm it in your book (${editionPin}).</p>
        <div class="tr-ladder">
          <p class="tr-ladder-label">Search ladder</p>
          <ol>${ladder}</ol>
        </div>
        ${banners}
      </div>
      <div class="tr-actionrow">
        <button type="button" class="nav" id="tr-next">${isLast ? 'Back to topics' : 'Next drill'}</button>
      </div>
    </section>`;

  root.querySelector('#tr-exit').addEventListener('click', onExit);
  root.querySelector('#tr-next').addEventListener('click', () => (isLast ? onExit() : onNext(index + 1)));

  if (!correct) root.querySelector('.tr-result-card').classList.add('shake');
}

function renderDrill(root, ctx) {
  const { drill, topicTitle, book, index, total, cleared, tabsByBook, editionPins, getProgress, onResult, onNext, onExit } = ctx;
  // Book-derived mode/tabs/edition pin — never hardcoded to 'nec' (Task 9):
  // an OSHA topic's drills mount the OSHA codebook mode and show the OSHA
  // edition pin instead of the NEC one.
  const mode = book === 'osha' ? 'osha' : 'nec';
  const tabs = tabsByBook[mode] || [];
  const editionPin = editionPins[mode];

  const choicesHtml = drill.choices
    .map(
      (c, i) =>
        `<button type="button" class="tr-choice" role="radio" aria-checked="false" data-choice="${i}"><span class="tr-choice-key">${String.fromCharCode(65 + i)}</span>${c}</button>`
    )
    .join('');

  const hintItems = drill.hintLadder
    .map((h, i) => `<li class="tr-hint-item" data-rung="${i}" hidden>${h}</li>`)
    .join('');

  root.innerHTML = `
    <section class="trainer-screen">
      <div class="tr-headrow">
        <h2>${topicTitle} &middot; Trainer</h2>
        <button type="button" class="nav ghost" id="tr-exit">All topics</button>
      </div>
      <p class="tr-progress">Drill ${index + 1} of ${total} · ${cleared ? 'topic already cleared' : `${CLEAR_THRESHOLD} correct clears this topic`}</p>
      <div class="tr-panes">
        <div class="tr-left">
          <div class="tr-timer" id="tr-timer">
            <svg class="tr-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
              <circle class="tr-ring-track" cx="32" cy="32" r="${RING_R}"></circle>
              <circle class="tr-ring-fill" id="tr-ring-fill" cx="32" cy="32" r="${RING_R}"></circle>
            </svg>
            <div class="tr-ring-label">
              <span class="tr-remaining" id="tr-remaining">${fmtClock(drill.timeTargetSec)}</span>
              <span class="tr-ring-target">target</span>
            </div>
          </div>
          <div class="tr-stem-card" id="tr-stem-card">
            <p class="tr-action-tag">Answer${drill.hard ? ' <span class="tr-hard-flag">requires lookup</span>' : ''}</p>
            <p class="tr-stem">${drill.stem}</p>
            <div class="tr-choices" role="radiogroup" aria-label="Answer choices">${choicesHtml}</div>
          </div>
          <div class="tr-hints">
            <p class="tr-hints-label">Stuck? Climb the search ladder</p>
            <div class="tr-hint-btns">
              <button type="button" class="tr-hint-btn" data-hint="0">Hint 1 · noun</button>
              <button type="button" class="tr-hint-btn" data-hint="1">Hint 2 · tab</button>
              <button type="button" class="tr-hint-btn" data-hint="2">Hint 3 · cite</button>
            </div>
            <ol class="tr-hint-list">${hintItems}</ol>
          </div>
          <p class="tr-lookup" id="tr-lookup" hidden>Lookup found ✓. A cited tab is open on the right.</p>
          <p class="tr-held" id="tr-held" hidden></p>
          <div class="tr-actionrow">
            <button type="button" class="nav" id="tr-submit" disabled>Submit</button>
            <span class="tr-edition">${editionPin} · verify every value in your book</span>
          </div>
        </div>
        <div class="tr-right">
          <div class="tr-codebook" id="tr-codebook"></div>
        </div>
      </div>
    </section>`;

  // ---- per-drill state ----
  let selected = null;
  let lookupHit = false;
  const pickedPath = [];
  let resolved = false;
  const startTs = Date.now();

  const submitBtn = root.querySelector('#tr-submit');
  const lookupEl = root.querySelector('#tr-lookup');
  const heldEl = root.querySelector('#tr-held');
  const choiceBtns = [...root.querySelectorAll('.tr-choice')];

  function hideHeld() {
    heldEl.hidden = true;
    heldEl.textContent = '';
  }

  choiceBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (resolved) return;
      selected = Number(btn.dataset.choice);
      choiceBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      submitBtn.disabled = false;
      hideHeld();
    });
  });

  root.querySelectorAll('.tr-hint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const li = root.querySelector(`.tr-hint-item[data-rung="${btn.dataset.hint}"]`);
      if (li) li.hidden = false;
      btn.disabled = true;
      btn.classList.add('used');
    });
  });

  root.querySelector('#tr-exit').addEventListener('click', onExit);

  // ---- timer ring (JS-stepped once per second; no CSS transition on the
  // stroke, so prefers-reduced-motion is honored — it just ticks in whole
  // seconds instead of sweeping smoothly). The ring is a soft TARGET, not a
  // cutoff: at zero it turns red but never blocks answering (that's Timed
  // mode, Task 10). ----
  const fillEl = root.querySelector('#tr-ring-fill');
  const remEl = root.querySelector('#tr-remaining');
  const timerWrap = root.querySelector('#tr-timer');
  const totalSec = drill.timeTargetSec;
  fillEl.style.strokeDasharray = String(RING_C);

  function paintTimer() {
    if (!document.body.contains(fillEl)) {
      stopTimer();
      return;
    }
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    const remaining = totalSec - elapsed;
    remEl.textContent = fmtClock(remaining);
    const frac = Math.max(0, Math.min(1, remaining / totalSec));
    fillEl.style.strokeDashoffset = String(RING_C * (1 - frac));
    timerWrap.classList.toggle('warn', remaining > 0 && remaining <= totalSec * 0.2);
    timerWrap.classList.toggle('over', remaining <= 0);
    if (remaining <= 0) stopTimer(); // nothing left to redraw; elapsed still read at submit
  }
  stopTimer();
  paintTimer();
  activeTimerId = setInterval(paintTimer, 1000);

  // ---- right pane: codebook. onPick records the visitor's navigation and
  // flags a lookup hit when they open a cited node/tab. Wrapped in mountCb so
  // the first-drill demo tour can re-mount it with the correct tab pre-opened
  // (highlightTarget) to SHOW which tab to flip to. ----
  function mountCb(highlightTarget) {
    mountCodebook(root.querySelector('#tr-codebook'), {
      mode,
      tabs,
      highlightTarget,
      onPick: (id) => {
        if (resolved) return;
        pickedPath.push(id);
        if ((drill.lookupPath || []).includes(id)) {
          lookupHit = true;
          lookupEl.hidden = false;
          hideHeld();
        }
      },
    });
  }
  mountCb(null);

  submitBtn.addEventListener('click', () => {
    if (resolved || selected == null) return;
    const correct = selected === drill.answerKey;

    // Hard-drill gate: a correct answer without the lookup is HELD, not scored
    // and not a miss — the whole point is to force the codebook habit.
    if (correct && drill.hard && !lookupHit) {
      heldEl.hidden = false;
      heldEl.textContent = 'This one needs the lookup first. Open one of the cited tabs on the right (Hint 2/3 names it), then submit again.';
      root.querySelector('#tr-stem-card').classList.remove('shake');
      // force reflow so the shake animation replays on repeat held-submits
      void root.querySelector('#tr-stem-card').offsetWidth;
      root.querySelector('#tr-stem-card').classList.add('shake');
      return;
    }

    resolved = true;
    stopTimer();
    const elapsed = Math.round((Date.now() - startTs) / 1000);

    const before = getProgress();
    const beforeCleared = (before.trainerTopicClears || []).includes(drill.topic);
    const beforeOsha = isOshaLaneUnlocked(before);
    const beforeOshaComplete = isOshaLaneComplete(before);

    const after = onResult({ drill, correct, lookupHit, pickedPath: pickedPath.slice(), elapsed }) || getProgress();

    const justCleared = !beforeCleared && (after.trainerTopicClears || []).includes(drill.topic);
    const justUnlockedOsha = !beforeOsha && isOshaLaneUnlocked(after);
    const justCompletedOsha = !beforeOshaComplete && isOshaLaneComplete(after);

    renderResult(root, {
      drill,
      topicTitle,
      index,
      total,
      correct,
      lookupHit,
      elapsed,
      after,
      justCleared,
      justUnlockedOsha,
      justCompletedOsha,
      editionPin,
      onNext,
      onExit,
    });
  });

  // First-ever drill: a guided DEMO. It performs the correct procedure as you
  // click through the pop-ups — opens the right tab, shows the green
  // confirmation, and selects the correct answer — so you watch one full lookup
  // done right, then take over. Show-once (Settings > Replay tips brings it back).
  if (!coachSeen('trainer-tour')) {
    const answerText = drill.choices[drill.answerKey];
    const demoTarget = (drill.lookupPath && drill.lookupPath[0]) || null;
    runTour([
      {
        target: () => root.querySelector('#tr-stem-card'),
        title: 'Read the question',
        body: 'Pick out the key words: the noun, plus any conditions like sizes or ratings. Those are exactly what you go looking for.',
      },
      {
        target: () => root.querySelector('#tr-codebook'),
        onEnter: () => { if (demoTarget) mountCb(demoTarget); },
        title: 'Flip to the right tab',
        body: 'Here is the tab and section for those key words, opened for you. On your own drills you flip to it yourself. These are the same tabs your real book has.',
      },
      {
        target: () => root.querySelector('#tr-lookup'),
        onEnter: () => { lookupHit = true; lookupEl.hidden = false; },
        title: 'Green means you found it',
        body: 'Opening a cited section gives you this green confirmation you are in the right place. Hard drills will not take an answer until you have opened it. That is the exam habit.',
      },
      {
        target: () => root.querySelector('.tr-choices'),
        onEnter: () => {
          const btn = root.querySelector(`.tr-choice[data-choice="${drill.answerKey}"]`);
          if (btn) btn.click();
        },
        title: 'The right answer, picked for you',
        body: `The method here: "${answerText}". It is already selected. Hit Submit to see the full search ladder and the reminder to confirm every value in your book.`,
        doneLabel: 'Got it, my turn',
      },
    ]);
  }
}

// renderTrainer(root, { topicsMeta, drillsByTopic, tabsByBook, editionPins, oshaUnlockTarget, getProgress, onResult })
//   topicsMeta   — [{ id, title, book }] for ALL topics, nec-250 + (Task 9)
//                  osha (main.js reuses the already-loaded walkthrough
//                  titles/book — the ids match by contract, so there is no
//                  second title source to drift). OSHA entries are hidden by
//                  the picker (visibleTopicsMeta) until the OSHA lane unlocks.
//   drillsByTopic— { topicId: drill[] } parsed from data/drills/nec-250-*.json
//                  and data/drills/osha-*.json.
//   tabsByBook   — { nec: nec-curated tabs, osha: osha-curated tabs }; each
//                  drill's mode/tab-set is picked off its topic's `book`.
//   editionPins  — manifest.editionPins ({ nec, osha }); the drill shown picks
//                  the pin matching its own book so it visibly carries its
//                  edition + "verify in your book".
//   oshaUnlockTarget — manifest.unlock.trainerTopicsForOsha, threaded through
//                  purely for the picker's "x/3" DISPLAY text — the real gate
//                  (main.js's onTrainerResult) reads the same manifest field
//                  directly, so this can never drift from it.
//   getProgress  — live getter (() => loadProgress(KEY)); the picker re-reads
//                  fresh state on every return trip (same reason as intro.js).
//   onResult(payload) — main.js owns the storage mutation and RETURNS the
//                  updated progress so this screen can show clear/unlock banners.
export function renderTrainer(root, { topicsMeta, drillsByTopic, tabsByBook, editionPins, oshaUnlockTarget, getProgress, onResult }) {
  stopTimer(); // clear any interval a prior mount left running

  function showPicker() {
    stopTimer();
    renderPicker(root, { topicsMeta, drillsByTopic, progress: getProgress(), oshaUnlockTarget, onSelect: startTopic });
  }

  function startTopic(topicId) {
    const meta = topicsMeta.find((t) => t.id === topicId);
    // Defensive re-check (belt-and-suspenders): the picker never renders a
    // button for a hidden OSHA topic OR a topic whose own walkthrough isn't
    // done, but don't trust either lock's absence-of-a-button alone.
    if (!meta || (meta.book === 'osha' && !isOshaLaneUnlocked(getProgress())) || !isTrainerTopicUnlocked(getProgress(), topicId)) {
      showPicker();
      return;
    }
    playDrill(topicId, 0);
  }

  function playDrill(topicId, index) {
    const drills = drillsByTopic[topicId] || [];
    if (!drills.length) {
      showPicker();
      return;
    }
    const safeIndex = Math.max(0, Math.min(index, drills.length - 1));
    const meta = topicsMeta.find((t) => t.id === topicId);
    const progress = getProgress();
    renderDrill(root, {
      drill: drills[safeIndex],
      topicTitle: meta ? meta.title : topicId,
      book: meta ? meta.book : 'nec',
      index: safeIndex,
      total: drills.length,
      cleared: (progress.trainerTopicClears || []).includes(topicId),
      tabsByBook,
      editionPins,
      getProgress,
      onResult,
      onNext: (nextIndex) => playDrill(topicId, nextIndex),
      onExit: showPicker,
    });
  }

  showPicker();
}
