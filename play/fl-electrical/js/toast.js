// js/toast.js — a tiny, dependency-free notification layer for just-in-time
// guidance and milestone acknowledgment. These are PERSISTENT banners: they
// stay up until the reader closes them (the × button, or an action button that
// resolves them). Nothing auto-dismisses, so a coaching message is never
// yanked away before it's read. Built to the accessibility consensus (NN/g,
// Material, Adrian Roselli, WCAG):
//   * ONE live-region host, created on load and injected into thereafter —
//     screen readers only announce CHANGES to an already-present region.
//   * role="status" (implicit aria-live="polite") — never steals focus, never
//     interrupts. Errors would use role="alert"; this app has none worth that.
//   * persist-until-closed sidesteps WCAG 2.2.1 (Timing Adjustable) entirely —
//     there is no timer to out-run.
//   * a hard stacking cap (oldest drops) so banners never march off-screen.
//   * all motion lives in CSS and is dropped under prefers-reduced-motion; a
//     JS fallback still removes the node when transitions are disabled.
//
// Messages are inserted as TEXT (never innerHTML) — callers pass plain strings.

const HOST_ID = 'toast-host';
const ONCE_PREFIX = 'fl-toast-once:';
const MAX_VISIBLE = 3;

let host = null;

export function initToasts() {
  if (host && document.body.contains(host)) return host;
  host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'toast-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    // deliberately NOT aria-atomic: we append discrete banners and want only
    // the newly-added one announced, not the whole stack re-read each time.
    document.body.appendChild(host);
  }
  return host;
}

const GLYPH = { win: '✓', lock: '🔒', info: '›' };

export function toast(message, opts = {}) {
  if (!host || !document.body.contains(host)) initToasts();
  const { type = 'info', action = null } = opts;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = GLYPH[type] || GLYPH.info;

  const msg = document.createElement('span');
  msg.className = 'toast-msg';
  msg.textContent = message; // TEXT, not markup — no injection surface

  el.appendChild(icon);
  el.appendChild(msg);

  let actionBtn = null;
  if (action && action.label) {
    actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action';
    actionBtn.textContent = action.label;
    el.appendChild(actionBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.textContent = '×';
  el.appendChild(closeBtn);

  host.appendChild(el);
  // enforce the stacking cap — drop the oldest beyond MAX_VISIBLE
  while (host.children.length > MAX_VISIBLE) host.firstElementChild.remove();

  let removed = false;
  function remove() {
    if (removed) return;
    removed = true;
    el.remove();
  }
  // Persistent: the ONLY ways out are the × or an action button. No timer.
  function dismiss() {
    el.classList.add('toast-out');
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 420); // fallback when transitions are off (reduced-motion)
  }

  closeBtn.addEventListener('click', dismiss);
  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      try {
        if (action.onClick) action.onClick();
      } finally {
        dismiss();
      }
    });
  }

  // entrance on the next frame so the CSS transition has a start state to run from
  requestAnimationFrame(() => el.classList.add('toast-in'));

  return { dismiss };
}

// Show-once nudges, backed by their OWN localStorage keys (kept out of the
// progress store so adding/removing a nudge never churns the progress schema
// or its migrations). Returns null if it has already fired for this browser.
export function toastOnce(key, message, opts = {}) {
  const k = ONCE_PREFIX + key;
  try {
    if (localStorage.getItem(k) === '1') return null;
    localStorage.setItem(k, '1');
  } catch (_) {
    // storage blocked (private mode etc.) — fall through and just show it
  }
  return toast(message, opts);
}

// Clear every show-once flag so the first-visit nudges fire again — called by
// "Reset progress" so a reset really is a clean slate (these flags live
// outside the progress store, so resetProgress() alone would leave them set).
export function resetToastOnce() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ONCE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (_) {
    // storage blocked — nothing to clear
  }
}
