/* kit-terminal engine — replays REAL captured tool output line-by-line in a live-looking terminal.
   Honest by construction: the strings in TERMINAL_CONFIG are verbatim captures of the actual scripts;
   a browser can't run bash, so this is a faithful REPLAY, not live execution. */
(function () {
  var cfg = window.TERMINAL_CONFIG || { prompt: '$', commands: [] };
  var screen = document.getElementById('screen');
  var cmds = document.getElementById('cmds');
  var token = 0;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function colorize(line) {
    var s = esc(line);
    s = s.replace(/\[PASS\]/g, '<span class="ok">[PASS]</span>')
         .replace(/\[INFO\]/g, '<span class="info">[INFO]</span>')
         .replace(/\[WARN\]/g, '<span class="warn">[WARN]</span>')
         .replace(/\[FAIL\]/g, '<span class="err">[FAIL]</span>');
    s = s.replace(/(GATE PASSED|COVERAGE OK|INTEGRITY OK|GIT IDENTITY OK|safe to commit|✓ in sync|\d+ passed|✔ done)/g, '<span class="ok">$1</span>');
    s = s.replace(/(✗ dirty[^<]*|offline)/g, '<span class="warn">$1</span>');
    s = s.replace(/(✓ in sync)/g, '<span class="ok">$1</span>');
    return s;
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function addLine(html, cls) {
    var d = document.createElement('div');
    d.className = 'line' + (cls ? ' ' + cls : '');
    d.innerHTML = html || '&nbsp;';
    screen.appendChild(d);
    screen.scrollTop = screen.scrollHeight;
    return d;
  }

  async function run(cmd, btn) {
    var my = ++token;
    Array.prototype.forEach.call(cmds.children, function (b) { b.disabled = true; b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    screen.innerHTML = '';
    var pl = addLine('<span class="prompt">' + esc(cfg.prompt) + '</span> ', 'cmdline');
    var typed = document.createElement('span');
    pl.appendChild(typed);
    var text = cmd.cmd;
    if (reduce) { typed.textContent = text; }
    else { for (var i = 0; i < text.length; i++) { if (my !== token) return; typed.textContent += text[i]; await sleep(20); } }
    await sleep(reduce ? 0 : 240);
    var lines = cmd.output.split('\n');
    for (var j = 0; j < lines.length; j++) {
      if (my !== token) return;
      addLine(colorize(lines[j]));
      if (!reduce) await sleep(lines[j].trim() === '' ? 10 : 34);
    }
    if (my !== token) return;
    addLine('<span class="prompt">' + esc(cfg.prompt) + '</span> <span class="cursor"></span>', 'cmdline');
    Array.prototype.forEach.call(cmds.children, function (b) { b.disabled = false; });
    if (btn) btn.classList.add('active');
  }

  cfg.commands.forEach(function (c) {
    var b = document.createElement('button');
    b.textContent = c.label;
    b.addEventListener('click', function () { run(c, b); });
    cmds.appendChild(b);
  });
  if (cfg.commands.length) run(cfg.commands[0], cmds.children[0]);
})();
