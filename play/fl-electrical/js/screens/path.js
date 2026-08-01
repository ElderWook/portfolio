// js/screens/path.js — the Path screen: a full-page rendering of the same
// data/path.json primer shown in the intro overlay. This is the only *real*
// screen this task builds; bookmap/walkthrough/trainer/timed land in Tasks
// 5-10 — main.js renders a "coming soon" placeholder for those meanwhile.
//
// `path` is never locked (the router guard in main.js lets `screen==='path'`
// through even while `!started`), so a visitor can read this page before
// ever touching the intro modal or the rail.

function renderStep(step) {
  const links = (step.links || [])
    .map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`)
    .join(' &middot; ');
  return `
    <li class="path-step">
      <h3>${step.heading}</h3>
      <p>${step.body}</p>
      ${links ? `<div class="path-links">${links}</div>` : ''}
    </li>`;
}

export function renderPath(root, { path, onShowIntro }) {
  const stepsHtml = (path.steps || []).map(renderStep).join('');
  root.innerHTML = `
    <section class="path-screen">
      <h2>${path.title}</h2>
      ${path.lede ? `<p class="path-lede">${path.lede}</p>` : ''}
      <ol class="path-steps">${stepsHtml}</ol>
      <button type="button" class="nav ghost" id="path-reopen-intro">Re-open intro</button>
    </section>`;
  root.querySelector('#path-reopen-intro').addEventListener('click', () => onShowIntro());
}
