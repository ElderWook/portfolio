// js/intro.js — first-run intro overlay (the "Path" primer) + Show intro.
//
// Two DISTINCT gates govern this flow (constraints.md):
//   canDismissIntro(p) — kitTouched || started — allowed to CLOSE the modal.
//   started            — the ONLY thing that unlocks the study rail (main.js
//                         owns the router guard + updateRailLocks).
// A pure skip with zero kit ticks must NOT close the overlay — it re-prompts
// on next visit (main.js's boot forces openIntro whenever `!started`,
// unconditionally — see its comment for why that alone satisfies "re-prompt
// on next visit" for both the zero-tick and kit-touched cases).
//
// `progress` is accepted as either a live snapshot OR a getter function.
// main.js passes a getter (`() => loadProgress(KEY)`) because the sidebar
// checklist stays clickable *behind* this overlay (see styles.css
// `.intro-backdrop { pointer-events: none }` — only `.intro-card` captures
// clicks) — a visitor can tick a book while the modal is still open, and the
// Skip button must see that fresh state, not a stale snapshot from openIntro
// time.

export function canDismissIntro(p) {
  return p.started === true || p.kitTouched === true;
}

// Alias — the interface line in the plan named this `closeIntroAllowed()`
// before the concrete code block settled on `canDismissIntro`. Exported under
// both names so either spelling resolves.
export const closeIntroAllowed = canDismissIntro;

// The intro modal is the MENTAL MODEL, kept short on purpose (research: an
// upfront wall of steps is forgotten in ~20s and reads as complexity). It
// carries the thesis + the 3 prep moves + the exam shape only. The granular
// detail steps (DBPR/CIB/editions/bring-rules) live on the always-open Path
// screen (path.js renders the SAME path.json plus those steps) — the modal is
// the hook, the Path screen is the manual.
function renderMove(move) {
  return `
    <li class="intro-move">
      <span class="intro-move-num" aria-hidden="true">${move.n}</span>
      <span class="intro-move-body">
        <span class="intro-move-title">${move.title}</span>
        <span class="intro-move-text">${move.body}</span>
        ${move.where ? `<span class="intro-move-where">${move.where}</span>` : ''}
      </span>
    </li>`;
}

export function openIntro(root, { path, progress, onStart, onSkip, onReset }) {
  const getProgress = typeof progress === 'function' ? progress : () => progress;
  // First run (!started): the ONLY action is Start studying — the single funnel
  // into the study rail + the first-visit site walkthrough. Re-opened later via
  // "Show intro" (already started): a plain Close. The old "Skip for now" (and
  // its kit-tick-gated shake) is gone — Start is the one way forward on run one.
  const started = getProgress().started === true;
  const movesHtml = (path.moves || []).map(renderMove).join('');
  const shapeHtml = (path.examShape || []).map((s) => `<li>${s}</li>`).join('');
  const cib = path.cib;

  root.innerHTML = `
    <div class="intro-backdrop">
      <div class="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div class="intro-thesis">
          <span class="pin1" aria-hidden="true"></span>
          ${path.kicker ? `<p class="intro-kicker">${path.kicker}</p>` : ''}
          <h2 id="intro-title">${path.title}</h2>
          ${path.lede ? `<p class="intro-lede">${path.lede}</p>` : ''}
        </div>
        ${movesHtml ? `
        <div class="intro-block">
          <p class="intro-block-label">What prep actually is</p>
          <ol class="intro-moves">${movesHtml}</ol>
        </div>` : ''}
        ${path.mythBuster ? `<p class="intro-myth"><span class="intro-myth-label">Note</span> ${path.mythBuster}</p>` : ''}
        ${shapeHtml ? `
        <div class="intro-block">
          <p class="intro-block-label">The exam at a glance</p>
          <ul class="intro-shape">${shapeHtml}</ul>
        </div>` : ''}
        ${cib ? `<p class="intro-cib"><a href="${cib.href}" target="_blank" rel="noopener">${cib.label} &#8599;</a>${cib.note ? ` <span class="intro-cib-note">${cib.note}</span>` : ''}</p>` : ''}
        <div class="intro-actions">
          ${started
            ? '<button type="button" class="nav" id="intro-close">Close</button>'
            : `<button type="button" class="nav intro-start-solo" id="intro-start">${(path.cta && path.cta.start) || 'Start studying'}</button>`}
        </div>
        ${onReset ? '<div class="intro-footer"><button type="button" class="intro-reset-link" id="intro-reset">Reset progress</button></div>' : ''}
      </div>
    </div>`;
  root.hidden = false;

  function close() {
    root.hidden = true;
    root.innerHTML = '';
  }

  // First run: Start studying is the sole CTA (markStarted + launch the site
  // tour, owned by main.js's onStart). Re-open after started: a plain Close
  // (onSkip in main.js just records the session-dismiss + refreshes rail locks).
  const startBtn = root.querySelector('#intro-start');
  if (startBtn) startBtn.addEventListener('click', () => { close(); onStart(); });

  const closeBtn = root.querySelector('#intro-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { close(); onSkip(); });

  // Hidden/advanced reset (design §3.1): "Reset progress" under Show intro →
  // confirm — for testing / starting a new exam cycle. This module never
  // touches storage itself (same pattern as every other screen); the confirm
  // dialog + resetProgress() call + UI reboot all live in main.js's onReset,
  // which reuses the app's existing render path rather than duplicating it.
  const resetBtn = root.querySelector('#intro-reset');
  if (resetBtn && onReset) {
    resetBtn.addEventListener('click', () => onReset());
  }
}
