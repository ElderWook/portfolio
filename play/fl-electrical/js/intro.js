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

function renderStep(step) {
  const links = (step.links || [])
    .map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`)
    .join(' &middot; ');
  return `
    <li class="intro-step">
      <h3>${step.heading}</h3>
      <p>${step.body}</p>
      ${links ? `<div class="intro-links">${links}</div>` : ''}
    </li>`;
}

export function openIntro(root, { path, progress, onStart, onSkip }) {
  const getProgress = typeof progress === 'function' ? progress : () => progress;
  const stepsHtml = (path.steps || []).map(renderStep).join('');

  root.innerHTML = `
    <div class="intro-backdrop">
      <div class="intro-card" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <h2 id="intro-title">${path.title}</h2>
        ${path.lede ? `<p class="intro-lede">${path.lede}</p>` : ''}
        <ol class="intro-steps">${stepsHtml}</ol>
        <p class="intro-note" id="intro-note" hidden aria-live="polite">Tick a kit item or Start studying to close this.</p>
        <div class="intro-actions">
          <button type="button" class="nav ghost" id="intro-skip">${(path.cta && path.cta.skip) || 'Skip for now'}</button>
          <button type="button" class="nav" id="intro-start">${(path.cta && path.cta.start) || 'Start studying'}</button>
        </div>
      </div>
    </div>`;
  root.hidden = false;

  const card = root.querySelector('.intro-card');
  const note = root.querySelector('#intro-note');

  function close() {
    root.hidden = true;
    root.innerHTML = '';
  }

  root.querySelector('#intro-start').addEventListener('click', () => {
    close();
    onStart();
  });

  root.querySelector('#intro-skip').addEventListener('click', () => {
    if (canDismissIntro(getProgress())) {
      close();
      onSkip();
      return;
    }
    // Fresh visitor, zero ticks: keep the overlay open and nudge instead.
    note.hidden = false;
    card.classList.remove('shake');
    void card.offsetWidth; // restart the animation even if already mid-shake
    card.classList.add('shake');
  });
}
