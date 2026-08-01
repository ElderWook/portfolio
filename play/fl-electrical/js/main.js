// GitHub Pages has no bundler — load ALL JSON via fetch (no import-attributes, which Pages won't serve).
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path);
  return r.json();
}

const SCREENS = ['path', 'bookmap', 'walkthrough', 'trainer', 'timed'];

export async function boot() {
  const manifest = await loadJSON('data/manifest.json');
  document.getElementById('rail').innerHTML = SCREENS.map((s) =>
    `<button type="button" data-screen="${s}" class="rail-btn">${s}</button>`
  ).join('');
  // Task 2+ wires progress + router
  console.info('fl-electrical boot', manifest.id);
}
boot();
