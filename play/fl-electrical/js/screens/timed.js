// js/screens/timed.js — Timed mini-set: 8-10 items mixed across Art. 250 +
// OSHA, played under a real per-question clock using the exam's three-pass
// strategy (Pass 1 knowledge -> Pass 2 lookup -> Pass 3 calc-last).
//
// UNLOCK (constraints.md): Timed unlocks at
// `progress.trainerTopicClears.length >= manifest.unlock.trainerClearsForTimed`
// (5 COMBINED Art.250 + OSHA clears) — NEVER raw trainerCorrectCount. With
// only four Art. 250 topics, reaching 5 clears always drags in at least one
// OSHA clear, so Timed always follows some OSHA practice. main.js's
// updateRailLocks() already disables the rail button below the threshold;
// isTimedUnlocked() here is the SAME check run again, defensively, inside
// the screen itself (same "don't trust the caller alone" pattern as
// trainer.js's/walkthrough.js's own startTopic re-checks) — a stale click
// or a direct go('timed') must not slip a locked run through.
//
// UNLIKE Trainer (Task 8): this screen gives NO per-question feedback while
// playing — that is the point of a timed self-check. Feedback only comes at
// the END, in a review that replays the CITATION PATH for every item
// (which tab/section to check) — never the correct choice text or a table
// value (cite-only, constraints.md). The per-question ring is also a HARD
// cutoff here, unlike Trainer's soft target (see trainer.js's own comment
// contrasting the two): at 0 the question auto-resolves with whatever is
// currently selected (or "unanswered" if nothing was picked yet) and the
// run moves on — no waiting on the visitor.
//
// THREE-PASS QUEUE: all N drills start queued for Pass 1. "Flag & next"
// (available on Pass 1 + Pass 2 only) defers the CURRENT item into the next
// pass's queue with no scoring at all — the real exam habit of skipping
// what you don't know cold, then circling back once you've looked things up
// or are ready to grind the harder items. Pass 3 is the last chance:
// flagging is disabled there, so every remaining item gets resolved
// (answered or timed out) before the run ends.
//
// SCORING lives in main.js (this module never touches storage — same
// pattern as trainer.js/walkthrough.js). Per resolved item it calls
//   onResult({ drill, correct, elapsed, pickedPath, timedOut })
// main.js owns the XP award (manifest.xp.timedUnderTarget, correct AND
// within the drill's own timeTargetSec) and the missLog push (same
// {stemId, yourPath, correctPath, elapsed} shape trainer.js's misses use).
// onAttemptStart() fires once, the moment "Start timed set" is clicked, so
// `timedAttempted` is set even if the visitor abandons the run partway —
// per constraints.md this flag means "attempted", not "finished".
//
// A fresh renderTimed() call (i.e. a fresh nav to this screen) always
// starts a brand-new attempt; the in-progress run itself does NOT persist
// across a reload — only `timedAttempted` and any missLog entries logged so
// far do (both live in progress.js's normal DEFAULT shape already).

import { mountCodebook } from '../codebook-mock.js';

export function isTimedUnlocked(progress, unlockTarget) {
  return (progress.trainerTopicClears || []).length >= unlockTarget;
}

// Every timed-mini item keeps its ORIGINAL topic id (nec-250-* / osha-*) so
// this file can pick the right codebook mode/edition-pin per item without a
// second lookup table — same id-prefix convention trainer.js already uses
// for its own osha counting (id.startsWith('drill-osha-')).
function bookForTopic(topicId) {
  return topicId.startsWith('osha') ? 'osha' : 'nec';
}

const PASS_LABELS = ['Knowledge', 'Lookup', 'Calc-last'];

// Module-level timer singleton — same reasoning as trainer.js: renderScreen()
// in main.js swaps #screen.innerHTML wholesale on navigation with no
// teardown hook, so a running interval must be stopped on every question
// change/exit, and each tick self-clears if its ring left the DOM.
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

function renderPassChips(passIndex, counts) {
  return PASS_LABELS.map((label, i) => {
    const cls = ['tm-chip', i < passIndex ? 'done' : '', i === passIndex ? 'current' : ''].filter(Boolean).join(' ');
    return `<span class="${cls}"><span class="tm-chip-num">${i + 1}</span> ${label} &middot; ${counts[i]}</span>`;
  }).join('');
}

function renderLocked(root, { clears, unlockTarget }) {
  root.innerHTML = `
    <section class="timed-screen">
      <h2>Timed mini-set</h2>
      <p class="tm-locked">Locked &mdash; clear <strong>${unlockTarget}</strong> combined Art. 250 + OSHA topics in the Trainer to unlock (with only four Art. 250 topics, reaching ${unlockTarget} always pulls in at least one OSHA clear). <strong>${clears}/${unlockTarget}</strong> cleared so far.</p>
    </section>`;
}

function renderIntro(root, { drills, onStart }) {
  root.innerHTML = `
    <section class="timed-screen">
      <h2>Timed mini-set</h2>
      <p class="tm-lede">${drills.length} items, mixed Art. 250 + OSHA. Each question carries its own clock &mdash; on this screen it is a real cutoff, not the soft target the Trainer used. Work it in three passes:</p>
      <ol class="tm-strategy">
        <li><strong>Pass 1 &middot; Knowledge.</strong> Answer what you know cold. Flag anything else and move on.</li>
        <li><strong>Pass 2 &middot; Lookup.</strong> Circle back through the flagged items with the codebook open.</li>
        <li><strong>Pass 3 &middot; Calc-last.</strong> Whatever is still flagged gets finished here &mdash; no more flagging.</li>
      </ol>
      <p class="tm-lede">No feedback while you play. The review at the end replays the citation PATH for every item &mdash; where to check &mdash; never the answer itself. Verify every value in your own book.</p>
      <button type="button" class="nav" id="tm-start">Start timed set</button>
    </section>`;
  root.querySelector('#tm-start').addEventListener('click', onStart);
}

function renderPassBreak(root, { passIndex, queuedCount, onContinue }) {
  root.innerHTML = `
    <section class="timed-screen">
      <div class="tm-chips">${renderPassChips(passIndex, [0, 0, 0].map((_, i) => (i === passIndex ? queuedCount : 0)))}</div>
      <div class="tm-pass-break">
        <h2>Pass ${passIndex + 1} &middot; ${PASS_LABELS[passIndex]}</h2>
        <p>${queuedCount} item${queuedCount === 1 ? '' : 's'} carried forward from the flags in Pass ${passIndex}.</p>
        <button type="button" class="nav" id="tm-continue">Continue</button>
      </div>
    </section>`;
  root.querySelector('#tm-continue').addEventListener('click', onContinue);
}

function renderReview(root, { logs, drills, editionPins, onRestart }) {
  const total = logs.length;
  const correctCount = logs.filter((l) => l.correct).length;

  const rows = logs
    .map((l) => {
      const book = bookForTopic(l.drill.topic);
      const editionPin = editionPins[book] || '';
      const verdictCls = l.correct ? 'ok' : l.timedOut ? 'timeout' : 'miss';
      const verdictLabel = l.correct ? 'Correct' : l.timedOut ? 'Timed out' : 'Miss';
      const pathHtml = (l.drill.lookupPath || [])
        .map((p) => `<span class="tm-path-node">${p}</span>`)
        .join('<span class="tm-path-arrow">&rarr;</span>');
      const flaggedTag = l.flagged ? '<span class="tm-flagged-tag">was flagged</span>' : '';
      return `
        <li class="tm-review-row ${verdictCls}">
          <div class="tm-review-head">
            <span class="tm-review-verdict">${verdictLabel}</span>
            <span class="tm-review-meta">Pass ${l.pass} &middot; ${fmtClock(l.elapsed)} / ${fmtClock(l.drill.timeTargetSec)} target ${flaggedTag}</span>
          </div>
          <p class="tm-review-stem">${l.drill.stem}</p>
          <p class="tm-review-cite"><span class="tm-review-cite-label">Check</span> ${pathHtml || 'your book'} &middot; ${editionPin}</p>
        </li>`;
    })
    .join('');

  root.innerHTML = `
    <section class="timed-screen">
      <h2>Timed set &mdash; review</h2>
      <p class="tm-lede">${correctCount}/${total} correct across ${drills.length} queued items. This replays where to LOOK for each one, not the correct choice &mdash; confirm every value in your own book.</p>
      <ul class="tm-review-list">${rows}</ul>
      <button type="button" class="nav" id="tm-restart">Run it again</button>
    </section>`;
  root.querySelector('#tm-restart').addEventListener('click', onRestart);
}

// renderTimed(root, { drills, tabsByBook, editionPins, unlockTarget, getProgress, onAttemptStart, onResult })
//   drills        — data/drills/timed-mini.json's `drills` array; each item
//                   is a full drill object (trainer.js's schema) carrying
//                   its ORIGINAL topic id so book/edition-pin resolve per
//                   item (bookForTopic above).
//   tabsByBook    — { nec, osha } tab sets, same shape trainer.js/
//                   walkthrough.js already consume.
//   editionPins   — manifest.editionPins ({ nec, osha }).
//   unlockTarget  — manifest.unlock.trainerClearsForTimed (5); passed in
//                   rather than the whole manifest so this screen only
//                   depends on the one number it actually gates on.
//   getProgress   — live getter (() => loadProgress(KEY)) — read once at
//                   mount to decide locked vs playable, same as every other
//                   screen's own re-check.
//   onAttemptStart() — fired once, when "Start timed set" is clicked.
//   onResult(payload) — fired once per resolved (answered or timed-out)
//                   item; main.js owns the XP/missLog mutation.
export function renderTimed(root, { drills, tabsByBook, editionPins, unlockTarget, getProgress, onAttemptStart, onResult }) {
  stopTimer(); // clear any interval a prior mount left running

  const progress = getProgress();
  if (!isTimedUnlocked(progress, unlockTarget)) {
    renderLocked(root, { clears: (progress.trainerTopicClears || []).length, unlockTarget });
    return;
  }
  if (!drills.length) {
    root.innerHTML = '<section class="timed-screen"><h2>Timed mini-set</h2><p>No timed drills loaded.</p></section>';
    return;
  }

  // ---- run state, scoped to this renderTimed() call ----
  let passIndex = 0;
  const queues = [drills.map((_, i) => i), [], []];
  let pos = 0;
  const logs = []; // { drill, correct, elapsed, pickedPath, timedOut, pass, flagged }
  const flaggedOnce = new Set();

  function showIntro() {
    stopTimer();
    renderIntro(root, { drills, onStart: start });
  }

  function start() {
    onAttemptStart();
    playCurrent();
  }

  function advance() {
    pos += 1;
    playCurrent();
  }

  function playCurrent() {
    stopTimer();
    if (pos >= queues[passIndex].length) {
      if (passIndex >= 2) {
        finish();
        return;
      }
      const nextQueueLen = queues[passIndex + 1].length;
      passIndex += 1;
      pos = 0;
      if (nextQueueLen > 0) {
        renderPassBreak(root, { passIndex, queuedCount: nextQueueLen, onContinue: playCurrent });
        return;
      }
      // Nothing was flagged into the next pass — skip its breather screen
      // and re-evaluate from there (cascades through an empty Pass 2 AND 3
      // in the all-answered-in-Pass-1 case).
      playCurrent();
      return;
    }
    renderQuestion(queues[passIndex][pos]);
  }

  function finish() {
    stopTimer();
    renderReview(root, { logs, drills, editionPins, onRestart: showIntro });
  }

  function renderQuestion(drillIndex) {
    const drill = drills[drillIndex];
    const book = bookForTopic(drill.topic);
    const tabs = tabsByBook[book] || [];
    const editionPin = editionPins[book] || '';
    const canFlag = passIndex < 2;

    const choicesHtml = drill.choices
      .map(
        (c, i) =>
          `<button type="button" class="tm-choice" role="radio" aria-checked="false" data-choice="${i}"><span class="tm-choice-key">${String.fromCharCode(65 + i)}</span>${c}</button>`
      )
      .join('');

    root.innerHTML = `
      <section class="timed-screen">
        <div class="tm-headrow">
          <div class="tm-chips">${renderPassChips(passIndex, queues.map((q) => q.length))}</div>
          <span class="tm-qcount">Pass ${passIndex + 1} &middot; item ${pos + 1} of ${queues[passIndex].length} &middot; ${logs.length}/${drills.length} resolved overall</span>
        </div>
        <div class="tm-panes">
          <div class="tm-left">
            <div class="tm-timer" id="tm-timer">
              <svg class="tm-ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
                <circle class="tm-ring-track" cx="32" cy="32" r="${RING_R}"></circle>
                <circle class="tm-ring-fill" id="tm-ring-fill" cx="32" cy="32" r="${RING_R}"></circle>
              </svg>
              <div class="tm-ring-label">
                <span class="tm-remaining" id="tm-remaining">${fmtClock(drill.timeTargetSec)}</span>
                <span class="tm-ring-target">clock</span>
              </div>
            </div>
            <div class="tm-stem-card">
              ${drill.hard ? '<p class="tm-action-tag"><span class="tm-hard-flag">Hard &middot; lookup recommended</span></p>' : ''}
              <p class="tm-stem">${drill.stem}</p>
              <div class="tm-choices" role="radiogroup" aria-label="Answer choices">${choicesHtml}</div>
            </div>
            <div class="tm-actionrow">
              ${canFlag ? '<button type="button" class="nav ghost" id="tm-flag">Flag &amp; next</button>' : ''}
              <button type="button" class="nav" id="tm-submit" disabled>Submit</button>
              <span class="tm-edition">${editionPin}</span>
            </div>
          </div>
          <div class="tm-right"><div class="tm-codebook" id="tm-codebook"></div></div>
        </div>
      </section>`;

    // ---- per-question state ----
    let selected = null;
    let resolved = false;
    const pickedPath = [];
    const startTs = Date.now();

    const submitBtn = root.querySelector('#tm-submit');
    const flagBtn = root.querySelector('#tm-flag');
    const choiceBtns = [...root.querySelectorAll('.tm-choice')];

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
      });
    });

    mountCodebook(root.querySelector('#tm-codebook'), {
      mode: book,
      tabs,
      highlightTarget: null,
      onPick: (id) => {
        if (resolved) return;
        pickedPath.push(id);
      },
    });

    // resolve() is the ONE path out of a question: a manual Submit and the
    // ring hitting zero both call it. `timedOut` only matters for scoring
    // when nothing was ever selected (an actual unanswered timeout) — a
    // visitor who picked the right choice but never clicked Submit still
    // gets graded on that selection when the clock runs out (a fair
    // "your last pick counts" cutoff, not a punitive one).
    function resolve(timedOut) {
      if (resolved) return;
      resolved = true;
      stopTimer();
      const elapsed = Math.round((Date.now() - startTs) / 1000);
      const correct = selected != null && selected === drill.answerKey;
      const unanswered = timedOut && selected == null;
      logs.push({
        drill,
        correct,
        elapsed,
        pickedPath: pickedPath.slice(),
        timedOut: unanswered,
        pass: passIndex + 1,
        flagged: flaggedOnce.has(drillIndex),
      });
      onResult({ drill, correct, elapsed, pickedPath: pickedPath.slice(), timedOut: unanswered });
      advance();
    }

    submitBtn.addEventListener('click', () => resolve(false));
    if (flagBtn) {
      flagBtn.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        stopTimer();
        flaggedOnce.add(drillIndex);
        queues[passIndex + 1].push(drillIndex);
        advance();
      });
    }

    // ---- per-question HARD cutoff ring (JS-stepped once per second, same
    // reduced-motion approach as trainer.js: no CSS transition on the
    // stroke, so it just ticks in whole seconds; the blanket
    // prefers-reduced-motion rule in styles.css kills any animation, none
    // of which this ring relies on anyway). Unlike trainer.js, remaining<=0
    // here calls resolve(true) instead of just repainting red. ----
    const fillEl = root.querySelector('#tm-ring-fill');
    const remEl = root.querySelector('#tm-remaining');
    const timerWrap = root.querySelector('#tm-timer');
    const totalSec = drill.timeTargetSec;
    fillEl.style.strokeDasharray = String(RING_C);

    function paintTimer() {
      if (!document.body.contains(fillEl)) {
        stopTimer();
        return;
      }
      const elapsedNow = Math.floor((Date.now() - startTs) / 1000);
      const remaining = totalSec - elapsedNow;
      remEl.textContent = fmtClock(remaining);
      const frac = Math.max(0, Math.min(1, remaining / totalSec));
      fillEl.style.strokeDashoffset = String(RING_C * (1 - frac));
      timerWrap.classList.toggle('warn', remaining > 0 && remaining <= totalSec * 0.2);
      timerWrap.classList.toggle('over', remaining <= 0);
      if (remaining <= 0) resolve(true);
    }
    stopTimer();
    paintTimer();
    activeTimerId = setInterval(paintTimer, 1000);
  }

  showIntro();
}
