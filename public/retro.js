/* ==========================================================================
   retro-brutalist-ui  v2.0  --  runtime helpers. Zero dependencies. Optional.
   Pairs with retro.css. Exposes window.RetroUI.

   FOUC guard: paste this in <head> BEFORE the stylesheet so the saved theme
   applies before first paint:
     <script>try{var d=document.documentElement,s=localStorage;
       d.dataset.theme=s.getItem('rb-theme')||'phosphor';
       ['scanlines','sweep','motion','contrast'].forEach(function(k){
         var v=s.getItem('rb-'+k); if(v) d.dataset[k]=v;});}catch(e){}</script>
   ========================================================================== */
(function (global) {
  'use strict';

  var THEMES = ['phosphor', 'amber', 'vaporwave', 'toxic', 'gameboy', 'matrix', 'soviet', 'blueprint', 'paper'];
  var root = document.documentElement;

  var store = {
    get: function (k) { try { return localStorage.getItem('rb-' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('rb-' + k, v); } catch (e) { /* private mode */ } }
  };

  function reducedMotion() {
    return root.dataset.motion === 'off' ||
      (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---- theme + display flags ------------------------------------------- */
  function emit() { document.dispatchEvent(new CustomEvent('retro:theme', { detail: palette() })); }

  function setTheme(name) {
    if (THEMES.indexOf(name) < 0) name = 'phosphor';
    root.dataset.theme = name;
    store.set('theme', name);
    syncControls();
    emit();
  }
  function cycleTheme() { setTheme(THEMES[(THEMES.indexOf(root.dataset.theme) + 1) % THEMES.length]); }

  /* flag(key, onValue, offValue): scanlines on/off, sweep on/off, motion on/off, contrast high/normal */
  var FLAGS = {
    scanlines: ['on', 'off'],
    sweep:     ['on', 'off'],
    motion:    ['on', 'off'],
    contrast:  ['high', 'normal']
  };
  function setFlag(key, on) {
    var pair = FLAGS[key]; if (!pair) return;
    root.dataset[key] = on ? pair[0] : pair[1];
    store.set(key, root.dataset[key]);
    syncControls();
    emit();
  }
  function getFlag(key) {
    var pair = FLAGS[key], v = root.dataset[key];
    if (key === 'scanlines') return v !== 'off';
    if (key === 'motion') return v !== 'off';
    return v === pair[0];
  }

  function syncControls() {
    var t = root.dataset.theme || 'phosphor';
    document.querySelectorAll('[data-theme-select]').forEach(function (s) { s.value = t; });
    document.querySelectorAll('[data-flag]').forEach(function (el) {
      var on = getFlag(el.getAttribute('data-flag'));
      if (el.type === 'checkbox') el.checked = on;
      else el.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---- canvas palette: read the live CSS variables --------------------- */
  function palette() {
    var cs = getComputedStyle(root);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    return {
      bg: v('--bg'), panel: v('--panel'), ink: v('--ink'), dim: v('--dim'),
      line: v('--line'), grid: v('--line'), axis: v('--dim'),
      primary: v('--green'), shadow: v('--magenta'), heading: v('--amber'), data: v('--cyan')
    };
  }
  /* alpha('#ff2e63', .35) -> 'rgba(255,46,99,0.35)'  (hex only) */
  function alpha(hex, a) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  /* RetroUI.onTheme(fn) -> fn(palette) now and on every theme/flag change. Redraw charts here. */
  function onTheme(fn) { document.addEventListener('retro:theme', function (e) { fn(e.detail); }); fn(palette()); }

  /* ---- text helpers ---------------------------------------------------- */
  function asciiBar(pct, width, fill, empty) {
    width = width || 20; fill = fill || '█'; empty = empty || '░';
    pct = Math.max(0, Math.min(100, pct));
    var n = Math.round(pct / 100 * width);
    return '[' + new Array(n + 1).join(fill) + new Array(width - n + 1).join(empty) + '] ' + Math.round(pct) + '%';
  }

  /* Double-line box:  frame('TITLE', ['line1','line2'], {width: 40}) */
  function frame(title, lines, opts) {
    lines = [].concat(lines);
    var inner = Math.max((opts && opts.width) || 0, title.length + 4,
      Math.max.apply(null, lines.map(function (l) { return l.length; })) + 2);
    function pad(s) { return ' ' + s + new Array(inner - s.length).join(' '); }
    var head = '╔═ ' + title + ' ' + new Array(inner - title.length - 2).join('═') + '╗';
    var out = [head];
    lines.forEach(function (l) { out.push('║' + pad(l) + '║'); });
    out.push('╚' + new Array(inner + 1).join('═') + '╝');
    return out.join('\n');
  }

  /* Masthead banner. For big block letters use figlet/pyfiglet and paste into a pre.ascii. */
  function banner(text) {
    var t = String(text).toUpperCase().split('').join(' ');
    var rule = new Array(t.length + 9).join('═');
    return '▓▒░ ' + rule + ' ░▒▓\n▓▒░   ' + t + '   ░▒▓\n▓▒░ ' + rule + ' ░▒▓';
  }

  /* Typewriter. Resolves immediately when motion is reduced. */
  function type(el, text, speed) {
    return new Promise(function (resolve) {
      if (reducedMotion()) { el.textContent = text; return resolve(); }
      el.textContent = ''; var i = 0;
      (function tick() {
        el.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(tick, speed || 28); else resolve();
      })();
    });
  }

  /* Boot sequence: give each child of .boot an index for staggered reveal. */
  function bootSequence(container) {
    Array.prototype.forEach.call(container.children, function (c, i) { c.style.setProperty('--i', i); });
  }

  /* ---- toast ----------------------------------------------------------- */
  function toast(msg, kind, ms) {
    var box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3500);
  }

  /* ---- tabs: WAI-ARIA pattern with arrow keys -------------------------- */
  function initTabs(container) {
    var tabs = Array.prototype.slice.call(container.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault(); select(tabs[(n + tabs.length) % tabs.length], true);
      });
    });
    select(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0]);
  }

  /* ---- command palette (Ctrl/Cmd+K) ------------------------------------ */
  function palettePicker(commands) {
    var dlg = document.createElement('dialog');
    dlg.className = 'palette'; dlg.setAttribute('aria-label', 'Command palette');
    dlg.innerHTML = '<input type="text" placeholder="TYPE A COMMAND..." aria-label="Command" autocomplete="off">' +
      '<ul class="palette-list" role="listbox"></ul>';
    document.body.appendChild(dlg);
    var input = dlg.querySelector('input'), list = dlg.querySelector('ul'), shown = [], sel = 0;

    function render() {
      var q = input.value.toLowerCase();
      shown = commands.filter(function (c) { return c.name.toLowerCase().indexOf(q) >= 0; });
      sel = Math.min(sel, Math.max(shown.length - 1, 0));
      list.innerHTML = '';
      shown.forEach(function (c, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === sel));
        li.innerHTML = '<span></span><small></small>';
        li.firstChild.textContent = c.name; li.lastChild.textContent = c.hint || '';
        li.addEventListener('click', function () { run(c); });
        list.appendChild(li);
      });
    }
    function run(c) { dlg.close(); c.run(); }
    function open() { input.value = ''; sel = 0; render(); dlg.showModal(); input.focus(); }

    input.addEventListener('input', function () { sel = 0; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
      else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); run(shown[sel]); }
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? dlg.close() : open(); }
    });
    return { open: open };
  }

  /* ---- fake shell: RetroUI.shell(el, {help: fn, ...}) ------------------- */
  function shell(el, handlers) {
    var out = el.querySelector('.shell-out'), form = el.querySelector('form'), input = el.querySelector('input');
    function print(text, cls) {
      var d = document.createElement('div'); if (cls) d.className = cls; d.textContent = text;
      out.appendChild(d); out.scrollTop = out.scrollHeight;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var line = input.value.trim(); input.value = ''; if (!line) return;
      print('> ' + line, 'cmd');
      var parts = line.split(/\s+/), fn = handlers[parts[0]];
      if (fn) { var r = fn(parts.slice(1)); if (r) print(String(r)); }
      else print('unknown command: ' + parts[0] + ' (try "help")', 'err');
    });
    return { print: print };
  }

  /* ---- boot ------------------------------------------------------------ */
  function init() {
    // populate empty theme selects
    document.querySelectorAll('[data-theme-select]').forEach(function (s) {
      if (!s.options.length) THEMES.forEach(function (t) { s.add(new Option(t.toUpperCase(), t)); });
      s.addEventListener('change', function () { setTheme(s.value); });
    });
    document.querySelectorAll('[data-theme-cycle]').forEach(function (b) { b.addEventListener('click', cycleTheme); });
    document.querySelectorAll('[data-flag]').forEach(function (el) {
      var key = el.getAttribute('data-flag');
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'click', function () {
        setFlag(key, el.type === 'checkbox' ? el.checked : !getFlag(key));
      });
    });
    document.querySelectorAll('[data-tabs]').forEach(initTabs);
    document.querySelectorAll('.boot').forEach(bootSequence);
    document.querySelectorAll('[data-open-modal]').forEach(function (b) {
      b.addEventListener('click', function () { document.getElementById(b.getAttribute('data-open-modal')).showModal(); });
    });
    document.querySelectorAll('[data-close-modal]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });
    if (!root.dataset.theme) root.dataset.theme = store.get('theme') || 'phosphor';
    syncControls();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  global.RetroUI = {
    THEMES: THEMES, setTheme: setTheme, cycleTheme: cycleTheme, setFlag: setFlag, getFlag: getFlag,
    palette: palette, alpha: alpha, onTheme: onTheme, reducedMotion: reducedMotion,
    asciiBar: asciiBar, frame: frame, banner: banner, type: type,
    toast: toast, initTabs: initTabs, palettePicker: palettePicker, shell: shell
  };
})(window);
