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
//   pickNoun     — the step supplies its own `choices` array; rendered as
//                  plain buttons here (no codebook involved).
//   route        — (Task 9) same plain-button rendering as pickNoun; the
//                  step's `choices` are the finder names (['tab','contents',
//                  'index']) and `correctTarget` is the recommended one. No
//                  codebook mounts for this step either — it is choosing a
//                  TOOL, not a tab.
//   pickTab      — mounts the shared codebook mock (js/codebook-mock.js) in
//                  the topic's own book mode ('nec' or 'osha'); a tab-strip
//                  click fires onPick(tab.label).
//   openNotes    — same codebook mock; only the footnote-zone button is the
//                  expected pick (onPick('footnote-zone')).
//   findCitation — (Task 9) mounts the same codebook mock, but opened on the
//                  step's own `mode` ('index'|'contents') with ONLY that
//                  book's matching pack supplied (`indexByBook[mode]` for
//                  'index', `contentsByBook[mode]` for 'contents' — never
//                  both) plus a no-node placeholder tab in place of the real
//                  `tabs`, so the Index search box or Contents drill is the
//                  ONLY live surface (isolation: a findCitation correctTarget
//                  is also a real Tabs node id, so the real tabs/other pack
//                  would let a visitor route around the intended finder —
//                  see FINDER_TAB_PLACEHOLDER below). `correctTarget` is a
//                  citation TOKEN — the `cite` an index entry or contents
//                  leaf hands back to onPick, per codebook-mock.js's contract.
// In pickTab/openNotes the step's `correctTarget` is always a tab LABEL or
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
import { pathTo } from '../contents.js';

// Finder isolation for findCitation steps (mirrors trainer.js's Task 10
// FINDER_TAB_PLACEHOLDER, duplicated rather than imported to avoid a
// walkthrough.js <-> trainer.js import cycle): every findCitation
// correctTarget token is ALSO a real Tabs tree node id, so handing the real
// `tabs` array to the codebook here would let a visitor satisfy the step by
// clicking the Tabs tree instead of using the intended Index/Contents
// finder. This single no-node tab keeps the codebook's Tabs view non-empty
// (mountCodebook renders "No tabs loaded" on an empty array) while exposing
// zero clickable section nodes. `pillar: ''` (not a dash) — codebook-mock.js's
// pillarLabel() renders this into the visible group heading ("Art. " / "Part
// "), so it must stay plain text, same as trainer.js's own placeholder.
const FINDER_TAB_PLACEHOLDER = { label: 'Section tabs off. Use the finder above.', targets: [], pillar: '' };

export function trainerTopicUnlockKey(walkthroughId) {
  return `trainer-topic:${walkthroughId}`;
}

export function isTrainerTopicUnlocked(progress, walkthroughId) {
  return (progress.unlocked || []).includes(trainerTopicUnlockKey(walkthroughId));
}

function actionLabel(action) {
  if (action === 'pickNoun') return 'Pick the noun';
  if (action === 'route') return 'Pick the finder';
  if (action === 'pickTab') return 'Pick the tab';
  if (action === 'openNotes') return 'Check the notes';
  if (action === 'findCitation') return 'Find the citation';
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

function renderPicker(root, { topics, progress, isOshaUnlocked, onSelect, onReplayGuide }) {
  const cards = visibleTopics(topics, progress, isOshaUnlocked)
    .map((t) => renderTopicCard(t, progress))
    .join('');
  root.innerHTML = `
    <section class="walkthrough-screen">
      <div class="screen-headrow">
        <h2>Walkthroughs</h2>
        ${onReplayGuide ? '<button type="button" class="replay-guide" id="wt-replay">↻ Replay guide</button>' : ''}
      </div>
      <p class="wt-lede">Step-by-step drills that teach the SEARCH SEQUENCE: noun, tab, table/column, footnote. No sizes or table values live here. Open your book and verify everything.</p>
      <div class="wt-topic-grid">${cards}</div>
    </section>`;
  root.querySelectorAll('[data-topic]').forEach((btn) => {
    btn.addEventListener('click', () => onSelect(btn.dataset.topic));
  });
  const rb = root.querySelector('#wt-replay');
  if (rb && onReplayGuide) rb.addEventListener('click', onReplayGuide);
}

function renderChips(steps, currentIndex) {
  return steps
    .map((_, i) => {
      const cls = i < currentIndex ? 'wt-chip done' : i === currentIndex ? 'wt-chip current' : 'wt-chip';
      return `<span class="${cls}">${i + 1}</span>`;
    })
    .join('');
}

function renderPlayer(root, { topic, tabsByBook, indexByBook = {}, contentsByBook = {}, stepIndex, wrong, onPick, onExit, onReplayGuide }) {
  // Codebook MODE follows the topic's own `book` field — never hardcoded to
  // 'nec' — so an OSHA topic mounts the OSHA parts/subparts tree instead of
  // the NEC tab strip (Task 6's mountCodebook contract).
  const mode = topic.book === 'osha' ? 'osha' : 'nec';
  const tabs = tabsByBook[mode] || [];
  const step = topic.steps[stepIndex];
  // pickNoun and route both render plain choice buttons — no codebook — the
  // difference is only what the choices MEAN (a noun to underline vs. a
  // finder tool to pick). Every other action (pickTab/openNotes/
  // findCitation) mounts the codebook instead.
  const isChoiceStep = step.action === 'pickNoun' || step.action === 'route';
  const choicesHtml = isChoiceStep
    ? `<div class="wt-choices">${(step.choices || [])
        .map((c) => `<button type="button" class="wt-choice" data-choice="${c}">${c}</button>`)
        .join('')}</div>`
    : '';

  root.innerHTML = `
    <section class="walkthrough-screen">
      <div class="wt-headrow">
        <h2>${topic.title}</h2>
        <div class="headrow-btns">
          ${onReplayGuide ? '<button type="button" class="replay-guide" id="wt-replay">↻ Replay guide</button>' : ''}
          <button type="button" class="nav ghost" id="wt-exit">All topics</button>
        </div>
      </div>
      <div class="wt-chips" aria-label="Step ${stepIndex + 1} of ${topic.steps.length}">${renderChips(topic.steps, stepIndex)}</div>
      <div class="wt-prompt-card" id="wt-prompt-card">
        <p class="wt-action-tag">${actionLabel(step.action)}</p>
        <p class="wt-prompt">${step.prompt}</p>
        ${choicesHtml}
        <p class="wt-teach" id="wt-teach" ${wrong ? '' : 'hidden'}><span class="wt-teach-label">Teach</span> ${step.teach}</p>
      </div>
      ${!isChoiceStep ? '<div class="wt-codebook" id="wt-codebook"></div>' : ''}
    </section>`;

  root.querySelector('#wt-exit').addEventListener('click', onExit);
  const wtReplay = root.querySelector('#wt-replay');
  if (wtReplay && onReplayGuide) wtReplay.addEventListener('click', onReplayGuide);

  if (isChoiceStep) {
    root.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => onPick(btn.dataset.choice));
    });
  } else {
    // findCitation opens the codebook straight into its own view (Index or
    // Contents) with that book's packs, instead of the default Tabs view —
    // everything else (pickTab/openNotes) keeps the plain tabs-only mount.
    //
    // ISOLATION: a findCitation step's correctTarget is a citation token that
    // is ALSO a real Tabs tree node id, so the real `tabs` (and the OTHER
    // pack) must not be handed to the codebook here — only the chosen
    // surface (Index XOR Contents) plus the no-node placeholder tab, so the
    // step can only be satisfied through the intended finder (mirrors
    // trainer.js's Task 10 tool isolation).
    const isFindCitation = step.action === 'findCitation';
    mountCodebook(root.querySelector('#wt-codebook'), isFindCitation
      ? {
          mode,
          tabs: [FINDER_TAB_PLACEHOLDER],
          view: step.mode,
          highlightTarget: null,
          onPick,
          ...(step.mode === 'index' ? { index: indexByBook[mode] } : { contents: contentsByBook[mode] }),
        }
      : { mode, tabs, highlightTarget: null, onPick });
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

// renderWalkthrough(root, { topics, tabsByBook, indexByBook, contentsByBook, isOshaUnlocked, getProgress, onComplete })
//   topics      — ALL parsed walkthrough JSON files, NEC + OSHA combined
//                 (already fetched by main.js, same "preload, don't
//                 lazy-fetch" pattern as path/checklist/books/kit). Each
//                 topic's own `book` field ('nec'|'osha') selects both the
//                 codebook mode and (for OSHA) the picker's reveal gate.
//   tabsByBook  — { nec: data/tabs/nec-curated.json's tabs, osha:
//                 data/tabs/osha-curated.json's tabs }, so renderPlayer can
//                 mount the right tab set for whichever topic is active.
//   indexByBook, contentsByBook — (Task 9) the same per-book split as
//                 tabsByBook, for the corpora a `findCitation` step's Index/
//                 Contents view needs (Task 8 wires these in from main.js;
//                 see mountCodebook's own `index`/`contents` opts).
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
export function renderWalkthrough(root, { topics, tabsByBook, indexByBook = {}, contentsByBook = {}, isOshaUnlocked = () => false, getProgress, onComplete }) {
  // Resolved once per startTopic() call rather than re-searched from
  // `topics` on every playStep()/handlePick() — a topic is picked once per
  // play-through, so there is exactly one lookup to do, not one per click.
  let activeTopic = null;
  let stepIndex = 0;
  let wrong = false;
  let demo = false; // the first walkthrough ever plays as a guided DEMO (auto-picks correct)
  let forceDemo = false; // set by the "Replay guide" button to re-run the demo on demand

  function showPicker() {
    closeCoachmark();
    activeTopic = null;
    renderPicker(root, { topics, progress: getProgress(), isOshaUnlocked, onSelect: startTopic, onReplayGuide: replayGuide });
  }

  // "Replay guide": re-run the guided demo on the active topic, or (from the
  // picker) on the first available topic.
  function replayGuide() {
    const t = activeTopic || visibleTopics(topics, getProgress(), isOshaUnlocked)[0];
    if (!t) return;
    forceDemo = true;
    startTopic(t.id);
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
    demo = forceDemo || !coachSeen('walkthrough-tour'); // demo the FIRST topic, or on Replay guide
    forceDemo = false;
    playStep();
  }

  function playStep() {
    renderPlayer(root, { topic: activeTopic, tabsByBook, indexByBook, contentsByBook, stepIndex, wrong, onPick: handlePick, onExit: showPicker, onReplayGuide: replayGuide });
    if (demo) showStepCoach();
  }

  // Re-mount the walkthrough's codebook with a tab (or the footnote zone)
  // pre-opened, so a demo step can SHOW the right place to look. `extra` lets
  // a findCitation demo also hand the mount its `view`/`index`/`contents`
  // (see showStepCoach below) without every other caller having to know
  // about those opts — they default to nothing, same Tabs-only mount as before.
  function remountWtCodebook(highlightTarget, extra = {}) {
    const mode = activeTopic.book === 'osha' ? 'osha' : 'nec';
    const el = root.querySelector('#wt-codebook');
    if (el) mountCodebook(el, { mode, tabs: tabsByBook[mode] || [], highlightTarget, onPick: handlePick, ...extra });
  }

  // End the demo WITHOUT completing the topic — reset to step 1 in normal mode
  // so the visitor still works the walkthrough for real (the demo only shows the
  // path once, it doesn't finish it for you).
  function restartForReal() {
    demo = false;
    stepIndex = 0;
    wrong = false;
    playStep();
  }

  // The DEMO coach-mark for the current step: highlight the correct answer (the
  // noun choice, or the right tab / notes opened in the codebook) and, on Next,
  // auto-pick it so the demo advances itself. The last step (or Skip) resets the
  // topic so the visitor completes it themselves.
  function showStepCoach() {
    const step = activeTopic.steps[stepIndex];
    const isLast = stepIndex + 1 >= activeTopic.steps.length;
    const mode = activeTopic.book === 'osha' ? 'osha' : 'nec';
    if (step.action === 'pickTab') remountWtCodebook(step.correctTarget);
    else if (step.action === 'openNotes') remountWtCodebook('footnote-zone');
    // findCitation has no tab/node to highlight (highlightTarget only applies
    // to the Tabs view, per codebook-mock.js's contract) — instead it opens
    // the codebook straight into the step's own Index/Contents view so the
    // demo shows the SAME panel the visitor will search or drill themselves.
    // Same isolation as renderPlayer above: override `tabs` with the no-node
    // placeholder and pass only the chosen pack (index XOR contents), so the
    // demo mount can't be satisfied via the Tabs tree either.
    else if (step.action === 'findCitation') {
      remountWtCodebook(null, {
        tabs: [FINDER_TAB_PLACEHOLDER],
        view: step.mode,
        ...(step.mode === 'index' ? { index: indexByBook[mode] } : { contents: contentsByBook[mode] }),
      });
    }

    let target;
    let title;
    let body;
    if (step.action === 'pickNoun' || step.action === 'route') {
      // route reuses the exact same "highlight the correct plain-button
      // choice" mechanics as pickNoun — only the title/body wording differs,
      // since a route choice is a FINDER tool, not a noun to underline.
      const choiceBtn = [...root.querySelectorAll('.wt-choice')].find((b) => b.dataset.choice === step.correctTarget);
      if (choiceBtn) choiceBtn.classList.add('wt-demo-pick');
      target = choiceBtn || root.querySelector('.wt-choices');
      if (step.action === 'route') {
        title = 'Pick the finder';
        body = `"${step.correctTarget}" is the right call here. That is the tool that gets you to the section.`;
      } else {
        title = 'Find the noun';
        body = `The key word here is "${step.correctTarget}". That is what you go search for.`;
      }
    } else if (step.action === 'openNotes') {
      target = root.querySelector('#wt-codebook .codebook-footnote') || root.querySelector('#wt-codebook');
      title = 'Check the notes';
      body = 'Before you answer, read the notes and exceptions under the table. The exam pulls its traps from there, not just the table body.';
    } else if (step.action === 'findCitation') {
      target = root.querySelector('#wt-codebook');
      title = 'Find the citation';
      // No new codebook-driving API here (mirrors pickTab below): the Index
      // view can't be typed into for the visitor, so the coachmark body just
      // names the move in words. A contents step gets the exact drill path,
      // via the same pathTo() helper the outline drill itself is built on.
      if (step.mode === 'contents') {
        const path = pathTo((contentsByBook[mode] || {}).outline, step.correctTarget);
        body = path ? `Drill Contents: ${path.map((n) => n.label).join(' > ')}.` : step.prompt;
      } else {
        body = step.prompt;
      }
    } else {
      target = root.querySelector('#wt-codebook');
      title = 'Flip to the right tab';
      body = `Open "${step.correctTarget}", the tab that holds this. It is highlighted for you.`;
    }
    if (!target) return;
    if (isLast) body += ' That is the whole path. Now you work it yourself.';

    coachmark(target, {
      title,
      body,
      step: stepIndex + 1,
      total: activeTopic.steps.length,
      nextLabel: isLast ? 'Now you try it' : 'Next',
      // Non-last steps auto-pick the correct answer to advance the demo. The
      // last step (and Skip) reset the topic instead of completing it, so the
      // visitor still has to work the walkthrough for real.
      onNext: isLast ? restartForReal : () => handlePick(step.correctTarget),
      onSkip: restartForReal,
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
