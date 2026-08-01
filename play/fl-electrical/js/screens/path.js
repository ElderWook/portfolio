// js/screens/path.js — the Path screen: the always-open "manual" version of
// data/path.json. It leads with the SAME thesis + prep moves the intro modal
// shows (one source of truth), then adds the granular detail steps
// (DBPR/CIB/editions/bring-rules) the modal deliberately leaves out — the
// modal is the hook, this screen is the full reference.
//
// `path` is never locked (the router guard in main.js lets `screen==='path'`
// through even while `!started`), so a visitor can read this page before ever
// touching the intro modal or the rail.

function renderMove(move) {
  return `
    <li class="path-move">
      <span class="path-move-num" aria-hidden="true">${move.n}</span>
      <span class="path-move-body">
        <span class="path-move-title">${move.title}</span>
        <span class="path-move-text">${move.body}</span>
        ${move.where ? `<span class="path-move-where">${move.where}</span>` : ''}
      </span>
    </li>`;
}

// The ROI heatmap — subjects sized by their exam weight. Bar widths are derived
// from each subject's high-end question count relative to the heaviest subject,
// so the visual ranking always matches the data (no hardcoded widths to drift).
// Cite-only: these are the public exam-blueprint weightings, not code content.
function renderRoi(roi) {
  if (!roi || !(roi.subjects || []).length) return '';
  const maxHigh = roi.subjects.reduce((m, s) => Math.max(m, s.high || 0), 0) || 1;
  const bars = roi.subjects.map((s) => {
    const w = Math.max(8, Math.round(((s.high || 0) / maxHigh) * 100));
    return `
      <div class="path-bar">
        <span class="path-bar-lab">${s.subject}</span>
        <span class="path-bar-track">
          <span class="path-bar-fill lane-${s.lane}" style="width:${w}%">${s.tag || ''}</span>
        </span>
        <span class="path-bar-q">${s.q}</span>
      </div>`;
  }).join('');
  const legend = (roi.legend || []).map((l) =>
    `<span><i class="lane-${l.lane}"></i>${l.label}</span>`
  ).join('');
  return `
    <div class="path-block">
      <p class="path-block-label">${roi.label}</p>
      ${roi.intro ? `<p class="path-roi-intro">${roi.intro}</p>` : ''}
      <div class="path-bars">${bars}</div>
      ${legend ? `<div class="path-legend">${legend}</div>` : ''}
      ${roi.note ? `<p class="path-roi-note">${roi.note}</p>` : ''}
    </div>`;
}

// The reference kit, grouped by how you acquire each book (buy / free-from-state
// / already inside the Contractors Manual). The authoritative order list is
// Checklist B in the sidebar; this is the strategic at-a-glance shape of it.
function renderKitGroups(kg) {
  if (!kg || !(kg.groups || []).length) return '';
  const cards = kg.groups.map((g) => {
    const items = (g.items || []).map((it) => `<li>${it}</li>`).join('');
    return `
      <div class="path-acol">
        <div class="path-acol-head">
          <span class="path-acol-badge badge-${g.id}">${g.badge}</span>
          <span class="path-acol-title">${g.title}</span>
        </div>
        ${g.intro ? `<p class="path-acol-intro">${g.intro}</p>` : ''}
        <ul class="path-acol-list">${items}</ul>
        ${g.excluded ? `<p class="path-acol-excluded">${g.excluded}</p>` : ''}
      </div>`;
  }).join('');
  return `
    <div class="path-block">
      <p class="path-block-label">${kg.label}</p>
      ${kg.intro ? `<p class="path-kit-intro">${kg.intro}</p>` : ''}
      <div class="path-acq">${cards}</div>
    </div>`;
}

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
  const movesHtml = (path.moves || []).map(renderMove).join('');
  const shapeHtml = (path.examShape || []).map((s) => `<li>${s}</li>`).join('');
  const roiHtml = renderRoi(path.roi);
  const kitGroupsHtml = renderKitGroups(path.kitGroups);
  const stepsHtml = (path.steps || []).map(renderStep).join('');
  const cib = path.cib;
  const fp = path.freePractice;

  root.innerHTML = `
    <section class="path-screen">
      <div class="path-thesis">
        <span class="pin1" aria-hidden="true"></span>
        ${path.kicker ? `<p class="path-kicker">${path.kicker}</p>` : ''}
        <h2>${path.title}</h2>
        ${path.lede ? `<p class="path-lede">${path.lede}</p>` : ''}
      </div>
      ${movesHtml ? `
      <div class="path-block">
        <p class="path-block-label">What prep actually is</p>
        <ol class="path-moves">${movesHtml}</ol>
      </div>` : ''}
      ${path.mythBuster ? `<p class="path-myth"><span class="path-myth-label">Note</span> ${path.mythBuster}</p>` : ''}
      ${shapeHtml ? `
      <div class="path-block">
        <p class="path-block-label">The exam at a glance</p>
        <ul class="path-shape">${shapeHtml}</ul>
      </div>` : ''}
      ${roiHtml}
      ${kitGroupsHtml}
      ${cib ? `<p class="path-cib"><a href="${cib.href}" target="_blank" rel="noopener">${cib.label} &#8599;</a>${cib.note ? ` <span class="path-cib-note">${cib.note}</span>` : ''}</p>` : ''}
      <div class="path-block">
        <p class="path-block-label">The details</p>
        <ol class="path-steps">${stepsHtml}</ol>
      </div>
      ${fp ? `
      <div class="path-freeprac">
        <span class="pin1" aria-hidden="true"></span>
        <p class="path-freeprac-label">Free practice</p>
        <p class="path-freeprac-title">${fp.label}</p>
        <p class="path-freeprac-body">${fp.body}</p>
        <a class="path-freeprac-cta" href="${fp.href}" target="_blank" rel="noopener">${fp.cta} &#8599;</a>
      </div>` : ''}
      <button type="button" class="nav ghost" id="path-reopen-intro">Re-open intro</button>
    </section>`;
  root.querySelector('#path-reopen-intro').addEventListener('click', () => onShowIntro());
}
