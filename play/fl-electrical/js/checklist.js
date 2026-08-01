// js/checklist.js — compartmented Prep Checklist (sidebar).
//
// renderChecklist(root, { checklist, books, kit, progress, onToggle, onOpenBook })
//   checklist  — parsed checklist.json ({ compartments: [...] })
//   books      — parsed books.json ({ books: [...] })
//   kit        — parsed kit.json ({ items: [...] })
//   progress   — current progress snapshot (from progress.js loadProgress)
//   onToggle(itemId, checked, { compartmentId }) — fired on any checkbox change;
//     the caller (main.js) owns persistence (mutateProgress) and re-rendering.
//   onOpenBook(bookId) — fired when a book row's info button is clicked; a no-op
//     hook until the Book Map screen (later task) wires a real detail flyer.
//
// Compartment open/closed state lives in the live DOM (<details>) so a re-render
// (triggered by every toggle) doesn't fight the user's manual expand/collapse —
// a compartment only gets its computed *default* open state the first time it
// appears (including the very first render).

const renderState = new WeakMap(); // root -> { visible: Set<compartmentId> }

// ---------- auto-status resolution (compartment E) ----------
// These read progress fields written by *other* screens (walkthrough/trainer/
// timed — later tasks). The id-prefix convention here (e.g. 'nec-250-*') is
// what those screens need to match for these rows to ever flip true.
function isAutoDone(auto, progress) {
  if (auto === 'pathComplete') return progress.pathComplete === true;
  if (auto === 'timedAttempted') return progress.timedAttempted === true;
  if (auto.startsWith('walkthroughs:')) {
    const topic = auto.slice('walkthroughs:'.length);
    return (progress.completedWalkthroughs || []).some((id) => id === topic || id.startsWith(`${topic}-`));
  }
  if (auto.startsWith('trainer:')) {
    const topic = auto.slice('trainer:'.length);
    return (progress.trainerTopicClears || []).some((id) => id === topic || id.startsWith(`${topic}-`));
  }
  if (auto.startsWith('lane:')) {
    const lane = auto.slice('lane:'.length);
    return (progress.unlocked || []).includes(`lane:${lane}`);
  }
  return false;
}

function rowsForCompartment(compartment, ctx) {
  if (compartment.itemsFromBooks) {
    return ctx.books.map((book) => ({ id: book.id, type: 'book', book }));
  }
  if (compartment.itemsFromKit) {
    const kitRows = ctx.kit.items.map((item) => ({ id: item.id, type: 'kit', kit: item }));
    const extraRows = (compartment.extra || []).map((item) => ({ id: item.id, type: 'plain', item }));
    return kitRows.concat(extraRows);
  }
  return (compartment.items || []).map((item) => ({
    id: item.id,
    type: item.auto ? 'auto' : item.disabled ? 'disabled' : 'plain',
    item,
  }));
}

function isRowChecked(row, progress) {
  if (row.type === 'auto') return isAutoDone(row.item.auto, progress);
  if (row.type === 'disabled') return false;
  return progress.checklist[row.id] === true;
}

function compartmentCompletion(compartment, ctx, progress) {
  const rows = rowsForCompartment(compartment, ctx);
  const done = rows.filter((row) => isRowChecked(row, progress)).length;
  return { done, total: rows.length, rows };
}

// F ("Business — later") is never hidden — it's always present, grayed/stubbed
// (design: "foreshadow the full license path"). studyHalfOrExpand only decides
// whether it starts pre-opened; the compartment's one item is unconditionally
// disabled by its own data (checklist.json f-stub.disabled), so it always reads
// as inert regardless of this threshold.
function isCompartmentUnlocked(compartment, progress) {
  switch (compartment.unlockWhen) {
    case 'started':
      return progress.started === true;
    case 'anyChecklistOrStarted':
      return progress.started === true || Object.values(progress.checklist).some((v) => v === true);
    case 'always':
    case 'studyHalfOrExpand':
    default:
      return true;
  }
}

function studyHalfDone(ctx, progress) {
  const study = ctx.checklist.compartments.find((c) => c.id === 'E');
  if (!study) return false;
  const { done, total } = compartmentCompletion(study, ctx, progress);
  return total > 0 && done / total >= 0.5;
}

function defaultOpenFor(compartment, ctx, progress) {
  if (compartment.id === 'B' || compartment.id === 'C') return progress.started !== true;
  if (compartment.id === 'E') return progress.started === true;
  if (compartment.id === 'F') return studyHalfDone(ctx, progress);
  return false;
}

function acquisitionLabel(acquisition) {
  if (acquisition === 'buy') return 'Buy';
  if (acquisition === 'free-state-pdf') return 'Free (state)';
  if (acquisition === 'in-contractors-manual') return 'In Contractors Manual';
  return acquisition;
}

function linksHtml(links) {
  return (links || [])
    .map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`)
    .join(' · ');
}

function renderBookRow(row, checked) {
  const book = row.book;
  const freeNote = book.acquisition === 'free-state-pdf'
    ? `<p class="crow-note">Not sold — free from the state after you're approved for the exam; one combined email request covers UL 681 + UL 365.</p>`
    : '';
  return `
    <div class="crow" data-row="${row.id}">
      <div class="crow-head">
        <label class="crow-main">
          <input type="checkbox" data-toggle="${row.id}" data-compartment="B" ${checked ? 'checked' : ''}>
          <span class="clabel">${book.title}</span>
        </label>
        <button type="button" class="cinfo" data-openbook="${row.id}" aria-label="Book details">&#9432;</button>
      </div>
      <div class="crow-meta">
        <span class="badge badge-${book.priority}">${book.priority === 'now' ? 'Need now' : 'Before exam'}</span>
        <span class="badge badge-acq">${acquisitionLabel(book.acquisition)}</span>
        <span class="cib">${book.cibCode} &middot; ed. ${book.edition}</span>
        <span class="cib">${book.examSubject} (${book.weightRange} Q)</span>
      </div>
      ${freeNote}
      <div class="crow-links">${linksHtml(book.orderLinks)}</div>
    </div>`;
}

function renderKitRow(row, checked) {
  const kit = row.kit;
  return `
    <div class="crow" data-row="${row.id}">
      <label class="crow-main">
        <input type="checkbox" data-toggle="${row.id}" data-compartment="C" ${checked ? 'checked' : ''}>
        <span class="clabel">${kit.label}</span>
      </label>
      <div class="crow-meta">
        <span class="badge ${kit.examDayOk ? 'badge-ok' : 'badge-warn'}">${kit.examDayOk ? 'Exam-day OK' : 'Home study only'}</span>
      </div>
      <p class="crow-note">${kit.notes}</p>
      <div class="crow-links">${linksHtml(kit.links)}</div>
    </div>`;
}

function renderPlainRow(row, checked, compartmentId) {
  const item = row.item;
  const open = item.href
    ? `<a class="crow-open" href="${item.href}" target="_blank" rel="noopener">Open &#8599;</a>`
    : '';
  return `
    <div class="crow" data-row="${row.id}">
      <label class="crow-main">
        <input type="checkbox" data-toggle="${row.id}" data-compartment="${compartmentId}" ${checked ? 'checked' : ''}>
        <span class="clabel">${item.label}</span>
      </label>
      ${open}
    </div>`;
}

function renderAutoRow(row, checked) {
  return `
    <div class="crow crow-auto" data-row="${row.id}">
      <span class="cstatus" aria-hidden="true">${checked ? '✓' : '○'}</span>
      <span class="clabel">${row.item.label}</span>
    </div>`;
}

function renderDisabledRow(row) {
  return `
    <div class="crow crow-disabled" data-row="${row.id}">
      <label class="crow-main">
        <input type="checkbox" disabled>
        <span class="clabel">${row.item.label}</span>
      </label>
      <span class="badge badge-soon">Post-beta</span>
    </div>`;
}

function renderRow(row, progress, compartmentId) {
  const checked = isRowChecked(row, progress);
  if (row.type === 'book') return renderBookRow(row, checked);
  if (row.type === 'kit') return renderKitRow(row, checked);
  if (row.type === 'auto') return renderAutoRow(row, checked);
  if (row.type === 'disabled') return renderDisabledRow(row);
  return renderPlainRow(row, checked, compartmentId);
}

function renderCompartment(compartment, ctx, progress, open) {
  const { done, total, rows } = compartmentCompletion(compartment, ctx, progress);
  const body = rows.map((row) => renderRow(row, progress, compartment.id)).join('');
  return `
    <details class="compartment" data-compartment="${compartment.id}" ${open ? 'open' : ''}>
      <summary>
        <span class="ctitle">${compartment.title}</span>
        <span class="ccount">${done}/${total}</span>
      </summary>
      <div class="citems">${body}</div>
    </details>`;
}

export function renderChecklist(root, { checklist, books, kit, progress, onToggle, onOpenBook }) {
  const ctx = { books: books.books, kit, checklist };
  const state = renderState.get(root) || { visible: new Set() };

  const prevOpen = new Map();
  root.querySelectorAll('details.compartment').forEach((d) => {
    prevOpen.set(d.dataset.compartment, d.open);
  });

  const nextVisible = new Set();
  const html = checklist.compartments
    .map((compartment) => {
      if (!isCompartmentUnlocked(compartment, progress)) return '';
      nextVisible.add(compartment.id);
      const wasVisible = state.visible.has(compartment.id);
      const open = wasVisible && prevOpen.has(compartment.id)
        ? prevOpen.get(compartment.id)
        : defaultOpenFor(compartment, ctx, progress);
      return renderCompartment(compartment, ctx, progress, open);
    })
    .join('');

  root.innerHTML = `<div class="checklist">${html}</div>`;
  renderState.set(root, { visible: nextVisible });

  root.querySelectorAll('input[data-toggle]').forEach((input) => {
    input.addEventListener('change', () => {
      onToggle(input.dataset.toggle, input.checked, { compartmentId: input.dataset.compartment });
    });
  });
  root.querySelectorAll('button[data-openbook]').forEach((btn) => {
    btn.addEventListener('click', () => onOpenBook(btn.dataset.openbook));
  });
}
