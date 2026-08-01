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
  trainerTopicClears: [], // e.g. 'nec-250-gec'
  trainerCorrectCount: 0,
  missLog: [],
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
  localStorage.setItem(storageKey, JSON.stringify(p));
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
