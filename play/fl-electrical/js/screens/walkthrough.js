// js/screens/walkthrough.js — Walkthrough engine: a topic picker plus a
// step-by-step player for the four Art. 250 topics
// (data/walkthroughs/nec-250-*.json) PLUS (Task 9) the OSHA topics
// (data/walkthroughs/osha-*.json), revealed in the same picker once the
// OSHA lane unlocks — see visibleTopics()/renderWalkthrough's isOshaUnlocked.
//
// CITE-ONLY (constraints.md): every walkthrough JSON stores section/table
// NUMBERS and a search SEQUENCE (noun -> tab -> table/column -> footnote) —
// never a table cell, an AWG size, a cmil area, or (for OSHA) a trigger
// height/ratio/reporting clock. Those come from the visitor's physical book.
//
// Each step names an `action`:
//   pickNoun   — the step supplies its own `choices` array; rendered as
//                plain buttons here (no codebook involved).
//   pickTab    — mounts the shared codebook mock (js/codebook-mock.js) in
//                the topic's own book mode ('nec' or 'osha'); a tab-strip
//                click fires onPick(tab.label).
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
// doubles as its Trainer topic id — nec-250-gec/122/122b/traps AND (Task 9)
// osha-falls/osha-ladders name the same topics in both screens.
// `onComplete(topicId)` is expected to push
// `trainerTopicUnlockKey(topicId)` into `progress.unlocked`. Task 8 should
// treat a Trainer topic as selectable only once
// `isTrainerTopicUnlocked(progress, topicId)` is true — this file exports
// both helpers so Task 8 doesn't have to re-derive the key format. This is
// deliberately separate from `trainerTopicClears`, which only Task 8's own
// scoring ever writes (constraints.md's unlock-graph gate reads clears, not
// this availability flag).

import { mountCodebook } from '../codebook-mock.js';
import { coachmark, coachSeen, closeCoachmark } from '../coachmark.js';

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

// OSHA topics are REVEALED only once the OSHA lane is unlocked (constraints:
// pickers show OSHA topics only after `isOshaLaneUnlocked` — hidden, not just
// disabled, before that; unlike the per-topic trainer lock below, which shows
// a disabled card once its OWN prefix-lane is already visible).
function visibleTopics(topics, progress, isOshaUnlocked) {
  return topics.filter((t) => t.book !== 'osha' || isOshaUnlocked(progress));
}

function renderPicker(root, { topics, progress, isOshaUnlocked, onSelect }) {
  const cards = visibleTopics(topics, progress, isOshaUnlocked)
    .map((t) => renderTopicCard(t, progress))
    .join('');
  root.innerHTML = `
    <section class="walkthrough-screen">
      <h2>Walkthroughs</h2>
      <p class="wt-lede">Step-by-step drills that teach the SEARCH SEQUENCE: noun, tab, table/column, footnote. No sizes or table values live here. Open your book and verify everything.</p>
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

function renderPlayer(root, { topic, tabsByBook, stepIndex, wrong, onPick, onExit }) {
  // Codebook MODE follows the topic's own `book` field — never hardcoded to
  // 'nec' — so an OSHA topic mounts the OSHA parts/subparts tree instead of
  // the NEC tab strip (Task 6's mountCodebook contract).
  const mode = topic.book === 'osha' ? 'osha' : 'nec';
  const tabs = tabsByBook[mode] || [];
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
      mode,
      tabs,
      highlightTarget: null,
      onPick,
    });
  }

  // No remove/reflow/re-add dance is needed here (unlike intro.js's shake,
  // which reuses one persistent modal node across repeated Skip clicks):
  // `root.innerHTML` above just built a brand-new `.wt-prompt-card` element,
  // so the `shake` class is present from its first paint and the CSS
  // animation always fires fresh.
  if (wrong) {
    root.querySelector('#wt-prompt-card').classList.add('shake');
  }
}

function renderDone(root, topic, onExit) {
  root.innerHTML = `
    <section class="walkthrough-screen">
      <div class="wt-complete">
        <h2>${topic.title} &middot; complete</h2>
        <p>Marked done. The matching Trainer topic just unlocked.</p>
        <button type="button" class="nav" id="wt-done-back">All topics</button>
      </div>
    </section>`;
  root.querySelector('#wt-done-back').addEventListener('click', onExit);
}

// renderWalkthrough(root, { topics, tabsByBook, isOshaUnlocked, getProgress, onComplete })
//   topics      — ALL parsed walkthrough JSON files, NEC + OSHA combined
//                 (already fetched by main.js, same "preload, don't
//                 lazy-fetch" pattern as path/checklist/books/kit). Each
//                 topic's own `book` field ('nec'|'osha') selects both the
//                 codebook mode and (for OSHA) the picker's reveal gate.
//   tabsByBook  — { nec: data/tabs/nec-curated.json's tabs, osha:
//                 data/tabs/osha-curated.json's tabs }, so renderPlayer can
//                 mount the right tab set for whichever topic is active.
//   isOshaUnlocked(progress) — Task 8's `isOshaLaneUnlocked`, injected from
//                 main.js rather than imported directly here to avoid a
//                 walkthrough.js <-> trainer.js import cycle (trainer.js
//                 already imports `isTrainerTopicUnlocked` FROM this file).
//                 Gates whether OSHA topic cards are ever rendered in the
//                 picker — see visibleTopics().
//   getProgress — a live getter (`() => loadProgress(KEY)`), not a snapshot —
//                 same reasoning as intro.js: onComplete mutates storage from
//                 inside this same screen instance, so the picker must
//                 re-read fresh state on every return trip rather than close
//                 over a stale snapshot from mount time. This is also what
//                 lets the OSHA reveal appear mid-session the moment the
//                 lane unlocks (no full screen remount needed).
//   onComplete(topicId) — fired once, on the right pick that finishes a
//                 topic's last step. The caller (main.js) owns the
//                 mutateProgress call (push id, award XP, unlock trainer
//                 topic) and any sidebar re-render.
export function renderWalkthrough(root, { topics, tabsByBook, isOshaUnlocked = () => false, getProgress, onComplete }) {
  // Resolved once per startTopic() call rather than re-searched from
  // `topics` on every playStep()/handlePick() — a topic is picked once per
  // play-through, so there is exactly one lookup to do, not one per click.
  let activeTopic = null;
  let stepIndex = 0;
  let wrong = false;
  let demo = false; // the first walkthrough ever plays as a guided DEMO (auto-picks correct)

  function showPicker() {
    closeCoachmark();
    activeTopic = null;
    renderPicker(root, { topics, progress: getProgress(), isOshaUnlocked, onSelect: startTopic });
  }

  function startTopic(topicId) {
    const topic = topics.find((t) => t.id === topicId);
    // Defensive re-check (belt-and-suspenders, mirrors trainer.js's own
    // startTopic guard): the picker never renders a button for a hidden OSHA
    // topic, but don't trust that alone against a stale card / replayed click.
    if (!topic || (topic.book === 'osha' && !isOshaUnlocked(getProgress()))) {
      showPicker();
      return;
    }
    activeTopic = topic;
    stepIndex = 0;
    wrong = false;
    demo = !coachSeen('walkthrough-tour'); // demo the FIRST topic the visitor opens
    playStep();
  }

  function playStep() {
    renderPlayer(root, { topic: activeTopic, tabsByBook, stepIndex, wrong, onPick: handlePick, onExit: showPicker });
    if (demo) showStepCoach();
  }

  // Re-mount the walkthrough's codebook with a tab (or the footnote zone)
  // pre-opened, so a demo step can SHOW the right place to look.
  function remountWtCodebook(highlightTarget) {
    const mode = activeTopic.book === 'osha' ? 'osha' : 'nec';
    const el = root.querySelector('#wt-codebook');
    if (el) mountCodebook(el, { mode, tabs: tabsByBook[mode] || [], highlightTarget, onPick: handlePick });
  }

  // The DEMO coach-mark for the current step: highlight the correct answer (the
  // noun choice, or the right tab / notes opened in the codebook) and, on Next,
  // auto-pick it so the walkthrough advances itself. Skip drops into normal play.
  function showStepCoach() {
    const step = activeTopic.steps[stepIndex];
    const isLast = stepIndex + 1 >= activeTopic.steps.length;
    if (step.action === 'pickTab') remountWtCodebook(step.correctTarget);
    else if (step.action === 'openNotes') remountWtCodebook('footnote-zone');

    let target;
    let title;
    let body;
    if (step.action === 'pickNoun') {
      const nounBtn = [...root.querySelectorAll('.wt-choice')].find((b) => b.dataset.choice === step.correctTarget);
      if (nounBtn) nounBtn.classList.add('wt-demo-pick');
      target = nounBtn || root.querySelector('.wt-choices');
      title = 'Find the noun';
      body = `The key word here is "${step.correctTarget}". That is what you go search for.`;
    } else if (step.action === 'openNotes') {
      target = root.querySelector('#wt-codebook .codebook-footnote') || root.querySelector('#wt-codebook');
      title = 'Check the notes';
      body = 'Before you answer, read the notes and exceptions under the table. The exam pulls its traps from there, not just the table body.';
    } else {
      target = root.querySelector('#wt-codebook');
      title = 'Flip to the right tab';
      body = `Open "${step.correctTarget}", the tab that holds this. It is highlighted for you.`;
    }
    if (!target) return;

    coachmark(target, {
      title,
      body,
      step: stepIndex + 1,
      total: activeTopic.steps.length,
      nextLabel: isLast ? 'Finish' : 'Next',
      onNext: () => handlePick(step.correctTarget), // auto-pick correct → advance
      onSkip: () => { demo = false; }, // drop into normal play at this step
    });
  }

  function handlePick(value) {
    const topic = activeTopic;
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
    demo = false;
    renderDone(root, topic, showPicker);
  }

  showPicker();
}
