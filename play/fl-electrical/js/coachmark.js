// js/coachmark.js — anchored coach-marks + a tour runner for first-run guided
// walkthroughs. Each mark spotlights ONE element (dims the page, cuts a bright
// hole over the target) and pins a tooltip beside it with an arrow pointing at
// it. Used by the Trainer (a 4-step lookup tour on the first drill) and the
// Book Map (a one-step "click a card" pointer). It positions itself at the
// element it explains, per the owner's spec.
//
// Show-once is handled here via coachSeen()/coachReset() localStorage flags,
// kept out of the progress store so adding a tour never churns its schema.
// Content is inserted as TEXT (never innerHTML) — callers pass plain strings.

const ONCE_PREFIX = 'fl-coach-once:';
let active = null; // { cleanup } for the open mark, or null

export function coachSeen(key) {
  // Returns true if already shown; otherwise marks it shown and returns false.
  try {
    if (localStorage.getItem(ONCE_PREFIX + key) === '1') return true;
    localStorage.setItem(ONCE_PREFIX + key, '1');
    return false;
  } catch (_) {
    return false; // storage blocked — just show it
  }
}

export function coachReset() {
  try {
    const ks = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ONCE_PREFIX)) ks.push(k);
    }
    ks.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

export function closeCoachmark() {
  if (active) {
    active.cleanup();
    active = null;
  }
}

function coachmark(target, opts) {
  const { title = '', body = '', step = 0, total = 0, nextLabel = 'Next', onNext = () => {}, onSkip = () => {} } = opts;

  const layer = document.createElement('div');
  layer.className = 'coach-layer'; // full-viewport, captures clicks (modal)

  const spot = document.createElement('div');
  spot.className = 'coach-spot'; // the bright hole (a huge box-shadow dims the rest)

  const pop = document.createElement('div');
  pop.className = 'coach-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'true');

  const arrow = document.createElement('span');
  arrow.className = 'coach-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  pop.appendChild(arrow);

  if (total > 1) {
    const stepEl = document.createElement('p');
    stepEl.className = 'coach-step';
    stepEl.textContent = `Step ${step} of ${total}`;
    pop.appendChild(stepEl);
  }
  if (title) {
    const titleEl = document.createElement('p');
    titleEl.className = 'coach-title';
    titleEl.textContent = title;
    pop.appendChild(titleEl);
  }
  const bodyEl = document.createElement('p');
  bodyEl.className = 'coach-body';
  bodyEl.textContent = body;
  pop.appendChild(bodyEl);

  const actions = document.createElement('div');
  actions.className = 'coach-actions';
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'coach-skip';
  skipBtn.textContent = 'Skip';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'coach-next';
  nextBtn.textContent = nextLabel;
  actions.appendChild(skipBtn);
  actions.appendChild(nextBtn);
  pop.appendChild(actions);

  layer.appendChild(spot);
  layer.appendChild(pop);
  document.body.appendChild(layer);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden'; // lock scroll while the mark is up

  function position() {
    const r = target.getBoundingClientRect();
    const pad = 6;
    spot.style.top = `${r.top - pad}px`;
    spot.style.left = `${r.left - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;

    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const gap = 14;
    // below the target unless there isn't room and there's room above
    const placeBelow = window.innerHeight - r.bottom > ph + gap || r.top < ph + gap;
    let top = placeBelow ? r.bottom + gap : r.top - ph - gap;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - ph - 12));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.classList.toggle('below', placeBelow);
    pop.classList.toggle('above', !placeBelow);
    const ax = Math.max(16, Math.min(r.left + r.width / 2 - left, pw - 16));
    arrow.style.left = `${ax}px`;
  }

  position();
  const reposition = () => position();
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);

  function cleanup() {
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    document.body.style.overflow = prevOverflow;
    layer.remove();
  }
  active = { cleanup };

  nextBtn.addEventListener('click', () => { closeCoachmark(); onNext(); });
  skipBtn.addEventListener('click', () => { closeCoachmark(); onSkip(); });
  nextBtn.focus();
}

// runTour(steps, { onDone }) — steps: [{ target, title, body, onEnter?, onExit?,
//   doneLabel? }]. `target` is an element or a () => element resolved at step
// time (the DOM may have changed). onEnter/onExit let a step reveal + restore a
// normally-hidden element (e.g. the green lookup confirmation). Missing targets
// are skipped. The backdrop is modal, so the only ways through are Next/Skip.
export function runTour(steps, opts = {}) {
  const { onDone = () => {} } = opts;
  let i = 0;
  let pendingExit = null;

  function runExit() {
    if (pendingExit) { try { pendingExit(); } catch (_) {} pendingExit = null; }
  }

  function show() {
    runExit();
    if (i >= steps.length) { onDone(); return; }
    const s = steps[i];
    const target = typeof s.target === 'function' ? s.target() : s.target;
    if (!target || !document.body.contains(target)) { i += 1; show(); return; }
    if (s.onEnter) { try { s.onEnter(); } catch (_) {} }
    pendingExit = s.onExit || null;
    const isLast = i >= steps.length - 1;
    coachmark(target, {
      title: s.title,
      body: s.body,
      step: i + 1,
      total: steps.length,
      nextLabel: isLast ? (s.doneLabel || 'Got it') : 'Next',
      onNext: () => { i += 1; show(); },
      onSkip: () => { runExit(); onDone(); },
    });
  }

  show();
}
