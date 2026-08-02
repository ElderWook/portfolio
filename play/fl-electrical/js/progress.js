// js/progress.js
const DEFAULT = () => ({
  v: 1,
  started: false,
  startedAt: null,
  lastScreen: 'path',
  checklist: {},          // id -> true
  xp: 0,
  unlocked: [],           // screen or topic ids
  completedWalkthroughs: [],
  trainerTopicClears: [], // e.g. 'nec-250-gec' — a topic with >=2 distinct correct drills
  trainerCorrectCount: 0, // lifetime tally (may double-count re-answers); NEVER gate unlocks on this
  trainerCorrectDrills: [], // distinct drill ids answered correctly — reload-safe source of topic clears
  missLog: [],
  indexReps: 0,
  contentsReps: 0,
  ladderStreak: 0,
  toolUsage: { tab: 0, index: 0, contents: 0 },
  introDismissedSession: false,
  kitTouched: false,
  pathComplete: false,
  timedAttempted: false,
});

export function loadProgress(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return DEFAULT();
    return { ...DEFAULT(), ...JSON.parse(raw), v: 1 };
  } catch {
    return DEFAULT();
  }
}

export function saveProgress(storageKey, p) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(p));
  } catch (err) {
    // Safari Private Mode / QuotaExceededError / any storage failure: don't
    // let a tick throw into the DOM event handler that triggered it. The
    // in-memory `p` the caller already has is still correct for this
    // session; it just won't survive a reload.
    console.warn('fl-electrical: failed to save progress', err);
  }
}

export function mutateProgress(storageKey, fn) {
  const p = loadProgress(storageKey);
  const next = fn(p) || p;
  saveProgress(storageKey, next);
  return next;
}

export function resetProgress(storageKey) {
  localStorage.removeItem(storageKey);
  return DEFAULT();
}

export function markStarted(storageKey) {
  return mutateProgress(storageKey, (p) => {
    if (!p.started) {
      p.started = true;
      p.startedAt = new Date().toISOString();
    }
    return p;
  });
}
