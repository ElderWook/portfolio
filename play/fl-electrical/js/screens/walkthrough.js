// js/screens/walkthrough.js — Walkthrough engine: a topic picker plus a
// step-by-step player for the four Art. 250 topics
// (data/walkthroughs/nec-250-*.json).
//
// CITE-ONLY (constraints.md): every walkthrough JSON stores section/table
// NUMBERS and a search SEQUENCE (noun -> tab -> table/column -> footnote) —
// never a table cell, an AWG size, a cmil area, or any other answer value.
// Those come from the visitor's physical book.
//
// Each step names an `action`:
//   pickNoun   — the step supplies its own `choices` array; rendered as
//                plain buttons here (no codebook involved).
//   pickTab    — mounts the shared codebook mock (js/codebook-mock.js) in
//                'nec' mode; a tab-strip click fires onPick(tab.label).
//   openNotes  — same codebook mock; only the footnote-zone button is the
//                expected pick (onPick('footnote-zone')).
// In both codebook cases the step's `correctTarget` is always a tab LABEL or
// the literal 'footnote-zone' string — never a bare section fragment — per
// Task 6's note that a bare fragment like "250.122" can first-match-resolve
// to the wrong tab. No `highlightTarget` is passed while playing, so the
// widget never spoils the answer.
//
// A wrong pick shakes the prompt card and reveals that step's `teach` text;
// a right pick clears the shake/teach and advances. Completing every step in
// a topic:
//   - pushes the topic's `id` into `completedWalkthroughs` (once),
//   - awards `manifest.xp.walkthrough` XP (once),
//   - marks the matching Trainer topic UNLOCKED (see contract below).
// This module never touches storage directly — like path.js/bookmap.js, it
// only calls back into main.js, which owns `mutateProgress` and re-renders
// the sidebar (XP counter, checklist auto-rows) afterward.
//
// UNLOCK CONTRACT for Task 8 (the Trainer screen): each walkthrough's `id`
// doubles as its Trainer topic id — nec-250-gec/122/122b/traps name the same
// four topics in both screens. `onComplete(topicId)` is expected to push
// `trainerTopicUnlockKey(topicId)` into `progress.unlocked`. Task 8 should
// treat a Trainer topic as selectable only once
// `isTrainerTopicUnlocked(progress, topicId)` is true — this file exports
// both helpers so Task 8 doesn't have to re-derive the key format. This is
// deliberately separate from `trainerTopicClears`, which only Task 8's own
// scoring ever writes (constraints.md's unlock-graph gate reads clears, not
// this availability flag).

import { mountCodebook } from '../codebook-mock.js';

export function trainerTopicUnlockKey(walkthroughId) {
  return `trainer-topic:${walkthroughId}`;
}

export function isTrainerTopicUnlocked(progress, walkthroughId) {
  return (progress.unlocked || []).includes(trainerTopicUnlockKey(walkthroughId));
}

function actionLabel(action) {
  if (action === 'pickNoun') return 'Pick the noun';
  if (action === 'pickTab') return 'Pick the tab';
  if (action === 'openNotes') return 'Check the notes';
  return action;
}

function renderTopicCard(topic, progress) {
  const done = (progress.completedWalkthroughs || []).includes(topic.id);
  return `
    <button type="button" class="wt-topic-card ${done ? 'done' : ''}" data-topic="${topic.id}">
      <span class="wt-topic-status" aria-hidden="true">${done ? '✓' : '○'}</span>
      <span class="wt-topic-body">
        <span class="wt-topic-title">${topic.title}</span>
        <span class="wt-topic-meta">${topic.steps.length} steps &middot; ${done ? 'Completed' : 'Not started'}</span>
      </span>
    </button>`;
}

function renderPicker(root, { topics, progress, onSelect }) {
  const cards = topics.map((t) => renderTopicCard(t, progress)).join('');
  root.innerHTML = `
    <section class="walkthrough-screen">
      <h2>Art. 250 Walkthroughs</h2>
      <p class="wt-lede">Step-by-step drills that teach the SEARCH SEQUENCE — noun, tab, table/column, footnote. No sizes or table values live here; open your book and verify everything.</p>
      <div class="wt-topic-grid">${cards}</div>
    </section>`;
  root.querySelectorAll('[data-topic]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.topic));
  });
}

function renderChips(steps, currentIndex) {
  return steps
    .map((_, i) => {
      const cls = i < currentIndex ? 'wt-chip done' : i === currentIndex ? 'wt-chip current' : 'wt-chip';
      return `<span class="${cls}">${i + 1}</span>`;
    })
    .join('');
}

function renderPlayer(root, { topic, tabs, stepIndex, wrong, onPick, onExit }) {
  const step = topic.steps[stepIndex];
  const isNoun = step.action === 'pickNoun';
  const choicesHtml = isNoun
    ? `<div class="wt-choices">${(step.choices || [])
        .map((c) => `<button type="button" class="wt-choice" data-choice="${c}">${c}</button>`)
        .join('')}</div>`
    : '';

  root.innerHTML = `
    <section class="walkthrough-screen">
      <div class="wt-headrow">
        <h2>${topic.title}</h2>
        <button type="button" class="nav ghost" id="wt-exit">All topics</button>
      </div>
      <div class="wt-chips" aria-label="Step ${stepIndex + 1} of ${topic.steps.length}">${renderChips(topic.steps, stepIndex)}</div>
      <div class="wt-prompt-card" id="wt-prompt-card">
        <p class="wt-action-tag">${actionLabel(step.action)}</p>
        <p class="wt-prompt">${step.prompt}</p>
        ${choicesHtml}
        <p class="wt-teach" id="wt-teach" ${wrong ? '' : 'hidden'}><span class="wt-teach-label">Teach</span> ${step.teach}</p>
      </div>
      ${!isNoun ? '<div class="wt-codebook" id="wt-codebook"></div>' : ''}
    </section>`;

  root.querySelector('#wt-exit').addEventListener('click', onExit);

  if (isNoun) {
    root.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => onPick(btn.dataset.choice));
    });
  } else {
    mountCodebook(root.querySelector('#wt-codebook'), {
      mode: 'nec',
      tabs,
      highlightTarget: null,
      onPick,
    });
  }

  if (wrong) {
    root.querySelector('#wt-prompt-card').classList.add('shake');
  }
}

function renderDone(root, topic, onExit) {
  root.innerHTML = `
    <section class="walkthrough-screen">
      <div class="wt-complete">
        <h2>${topic.title} &mdash; complete</h2>
        <p>Marked done. The matching Trainer topic just unlocked.</p>
        <button type="button" class="nav" id="wt-done-back">All topics</button>
      </div>
    </section>`;
  root.querySelector('#wt-done-back').addEventListener('click', onExit);
}

// renderWalkthrough(root, { topics, tabs, getProgress, onComplete })
//   topics      — the four parsed walkthrough JSON files (already fetched by
//                 main.js, same "preload, don't lazy-fetch" pattern as path/
//                 checklist/books/kit).
//   tabs        — data/tabs/nec-curated.json's `tabs` array, passed straight
//                 through to mountCodebook's 'nec' mode.
//   getProgress — a live getter (`() => loadProgress(KEY)`), not a snapshot —
//                 same reasoning as intro.js: onComplete mutates storage from
//                 inside this same screen instance, so the picker must
//                 re-read fresh state on every return trip rather than close
//                 over a stale snapshot from mount time.
//   onComplete(topicId) — fired once, on the right pick that finishes a
//                 topic's last step. The caller (main.js) owns the
//                 mutateProgress call (push id, award XP, unlock trainer
//                 topic) and any sidebar re-render.
export function renderWalkthrough(root, { topics, tabs, getProgress, onComplete }) {
  let activeTopicId = null;
  let stepIndex = 0;
  let wrong = false;

  function showPicker() {
    activeTopicId = null;
    renderPicker(root, { topics, progress: getProgress(), onSelect: startTopic });
  }

  function startTopic(topicId) {
    activeTopicId = topicId;
    stepIndex = 0;
    wrong = false;
    playStep();
  }

  function playStep() {
    const topic = topics.find((t) => t.id === activeTopicId);
    renderPlayer(root, { topic, tabs, stepIndex, wrong, onPick: handlePick, onExit: showPicker });
  }

  function handlePick(value) {
    const topic = topics.find((t) => t.id === activeTopicId);
    const step = topic.steps[stepIndex];
    if (value !== step.correctTarget) {
      wrong = true;
      playStep();
      return;
    }
    wrong = false;
    if (stepIndex + 1 < topic.steps.length) {
      stepIndex += 1;
      playStep();
      return;
    }
    onComplete(topic.id);
    renderDone(root, topic, showPicker);
  }

  showPicker();
}
