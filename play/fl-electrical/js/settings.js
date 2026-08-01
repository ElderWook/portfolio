// js/settings.js — the Settings overlay, opened from the top-bar "Settings"
// button. The Path screen already carries the intro/primer material, so the
// top button is freed up to house options: re-open the intro, replay the
// first-visit tips, reset progress, and whatever the guide grows into next.
//
// Like every other view here, this module owns NO storage — it only calls
// back into main.js, which holds the progress store and the toast layer.

export function openSettings(root, { onReset, onReplayTips, onShowIntro }) {
  root.innerHTML = `
    <div class="settings-backdrop">
      <div class="settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="settings-head">
          <span class="pin1" aria-hidden="true"></span>
          <p class="settings-kicker">Exam prep</p>
          <h2 id="settings-title">Settings</h2>
        </div>
        <ul class="settings-list">
          <li class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">Re-open the intro</span>
              <span class="settings-row-note">Show the open-book and indexing primer again.</span>
            </div>
            <button type="button" class="nav ghost" id="settings-intro">Show</button>
          </li>
          <li class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">Replay guided tour</span>
              <span class="settings-row-note">Run the first-visit walkthrough of the tabs, checklist, and settings again, plus the per-screen guides.</span>
            </div>
            <button type="button" class="nav ghost" id="settings-tips">Replay</button>
          </li>
          <li class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">Reset progress</span>
              <span class="settings-row-note">Clear your checklist, XP, and unlocks to start a new exam cycle.</span>
            </div>
            <button type="button" class="nav ghost" id="settings-reset">Reset</button>
          </li>
        </ul>
        <p class="settings-foot">More options will land here as the guide grows.</p>
        <div class="settings-actions">
          <button type="button" class="nav" id="settings-close">Done</button>
        </div>
      </div>
    </div>`;
  root.hidden = false;

  function close() {
    root.hidden = true;
    root.innerHTML = '';
  }

  root.querySelector('.settings-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });
  root.querySelector('#settings-close').addEventListener('click', close);
  root.querySelector('#settings-intro').addEventListener('click', () => { close(); onShowIntro(); });
  root.querySelector('#settings-tips').addEventListener('click', () => { close(); onReplayTips(); });
  root.querySelector('#settings-reset').addEventListener('click', () => { close(); onReset(); });
}
