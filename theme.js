(function () {
  if (window.__modernGamerLoaded) return;   // Marketplace may load this twice
  window.__modernGamerLoaded = true;

  // ---- settings you can edit ----
  const MG_VIZ_ENABLED = true;        // false = no visualizer
  const MG_COLORS_ENABLED = true;     // false = no Colors page (the rainbow stays)

// Modern Gamer — finds Spotify's panels and player parts WITHOUT relying on
// class names (Spotify's are randomized), then tags them with mg-* classes
// so user.css can lay them out.

const MG_TOP = '.Root__top-container, div:has(> .Root__lyrics-cinema)';

const MG_AREAS = {
  'left-sidebar': 'mg-ls',
  'main-view': 'mg-main',
  'right-sidebar': 'mg-rs',
  'now-playing-bar': 'mg-npb',
  'global-nav': 'mg-gn',
};

function waitForElement(els, func, timeout = 100) {
  const queries = els.map((el) => document.querySelector(el));
  if (queries.every((a) => a)) {
    func(queries);
  } else if (timeout > 0) {
    setTimeout(waitForElement, 300, els, func, --timeout);
  }
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function singleArea(el) {
  const parts = getComputedStyle(el).gridArea.split('/').map((s) => s.trim());
  return parts.every((p) => p === parts[0]) ? parts[0] : '';
}

/* add a class only if it's missing (avoids needless DOM writes / observer loops) */
function mgAdd(el, cls) {
  if (el && !el.classList.contains(cls)) el.classList.add(cls);
}

/* ---------- the page grid ---------- */
function tagPanels(top) {
  mgAdd(top, 'mg-top');
  for (const child of top.children) {
    const cls = MG_AREAS[singleArea(child)];
    if (cls) mgAdd(child, cls);
    // the top nav wrapper spans "top-banner / 1 / global-nav / -1"
    if (/^top-banner\s*\/\s*1\s*\/\s*global-nav/.test(getComputedStyle(child).gridArea)) {
      mgAdd(child, 'mg-gn');
    }
  }

  const bar = top.querySelector(':scope > .mg-npb');
  const rightbar = top.querySelector(':scope > .mg-rs');
  return { bar, rightbar };
}

/* ---------- the player (top of the right column) ---------- */
function ancestorContaining(start, target, stop) {
  let n = start;
  while (n && n !== stop && !n.contains(target)) n = n.parentElement;
  return n && n !== stop ? n : null;
}

function childContaining(parent, target) {
  return [...parent.children].find((k) => k.contains(target));
}

function tagPlayer(bar) {
  if (!bar) return;
  const widget = bar.querySelector(
    '[data-testid="now-playing-widget"], .main-nowPlayingWidget-nowPlaying'
  );
  const play = bar.querySelector('[data-testid="control-button-playpause"]');
  if (!widget || !play) return;

  // the row that holds [track info] [controls] [volume etc.]
  const container = ancestorContaining(play, widget, bar.parentElement);
  if (container) {
    // every wrapper from the container up to the player root
    for (let n = container; n && n !== bar; n = n.parentElement) {
      mgAdd(n, 'mg-wrap');
    }
    mgAdd(container, 'mg-pc');
    const L = childContaining(container, widget);
    const M = childContaining(container, play);
    if (L) mgAdd(L, 'mg-pl');
    if (M) mgAdd(M, 'mg-pm');
    [...container.children].forEach((k) => {
      if (k !== L && k !== M) mgAdd(k, 'mg-pr');
    });
  }

  // cover: make every wrapper from the <img> up to the widget flexible
  mgAdd(widget, 'mg-widget');
  widget.querySelectorAll('img').forEach((img) => {
    mgAdd(img, 'mg-cimg');
    if (img.parentElement && img.parentElement !== widget) mgAdd(img.parentElement, 'mg-cwrap');
    for (let n = img.parentElement; n && n !== widget; n = n.parentElement) {
      mgAdd(n, 'mg-cchain');
    }
  });

  // progress bar above the transport buttons
  const prog = bar.querySelector(
    '[data-testid="playback-progressbar"], .playback-bar'
  );
  if (prog) {
    const pcm = ancestorContaining(play, prog, bar.parentElement);
    if (pcm && pcm !== play) {
      mgAdd(pcm, 'mg-pcm');
      const btns = childContaining(pcm, play);
      const pg = childContaining(pcm, prog);
      if (btns) {
        mgAdd(btns, 'mg-btns');
        // [left group] [play] [right group] -> centre the play button exactly
        const kids = [...btns.children];
        const pi = kids.findIndex((k) => k.contains(play));
        if (pi >= 0) mgAdd(kids[pi], 'mg-playwrap');
        if (kids.length === 3 && pi === 1) {
          mgAdd(btns, 'mg-btns3');
          mgAdd(kids[0], 'mg-bl');
          mgAdd(kids[2], 'mg-br');
        }
      }
      if (pg && pg !== btns) mgAdd(pg, 'mg-prog');
    }
  }

  // volume row: let the slider stretch between the icons
  const vol = bar.querySelector('[data-testid="volume-bar"], .volume-bar');
  if (vol) {
    const right = vol.closest('.mg-pr');
    for (let n = vol; n && n !== right && n !== bar; n = n.parentElement) {
      if (n.parentElement && n.parentElement !== right) {
        mgAdd(n, 'mg-vol');
      } else {
        mgAdd(n, 'mg-vol');
        if (n.parentElement) mgAdd(n.parentElement, 'mg-row');
        break;
      }
    }
    if (right && !right.querySelector('.mg-row')) mgAdd(right, 'mg-row');
  }

  tagFill(bar.querySelector('.mg-prog'));
  tagFill(bar.querySelector('.mg-vol'));
}

/* ---------- no panels: flatten boxed cards in the right sidebar ---------- */
function flatten(root) {
  if (!root) return;
  for (const el of root.querySelectorAll('*')) {
    if (el.classList.contains('mg-flat')) continue;
    if (/^(BUTTON|INPUT|IMG|SVG|A|PATH)$/i.test(el.tagName)) continue;
    if (el.offsetWidth < 150 || el.offsetHeight < 56) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    if (parseFloat(cs.borderTopLeftRadius) < 6) continue;
    mgAdd(el, 'mg-flat');
  }
}


/* ---------- RGB fills: tag the bright "filled" part of progress/volume bars ---------- */
function lum(c) {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return -1;
  const [r, g, b, a = 1] = m[1].split(',').map(parseFloat);
  return (0.299 * r + 0.587 * g + 0.114 * b) * a;
}

function tagFill(scope) {
  if (!scope || scope.querySelector('.mg-fill')) return;
  const leaves = [];
  for (const el of scope.querySelectorAll('div, span')) {
    if (el.childElementCount) continue;
    const l = lum(getComputedStyle(el).backgroundColor);
    if (l > 0) leaves.push([el, l]);
  }
  if (!leaves.length) return;
  const max = Math.max(...leaves.map((x) => x[1]));
  if (max < 120) return;
  leaves.forEach(([el, l]) => { if (l >= max * 0.9) mgAdd(el, 'mg-fill'); });
}

/* ---------- tinted header backdrops (random class names) ---------- */
function killBackdrops(root) {
  if (!root) return;
  const rw = root.clientWidth;
  for (const el of root.querySelectorAll('div')) {
    if (el.classList.contains('mg-bgkill')) continue;
    if (el.offsetWidth < rw * 0.6 || el.offsetHeight < 80) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute') continue;
    const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    if (clear && cs.backgroundImage === 'none') continue;
    if (el.childElementCount > 3) continue;   // real content containers have many children
    mgAdd(el, 'mg-bgkill');
  }
}


/* ---------- top nav: clear any full-width solid bar inside it ---------- */
function clearBars(root) {
  if (!root) return;
  const rw = root.offsetWidth;
  if (!rw) return;
  for (const el of root.querySelectorAll('*')) {
    if (el.classList.contains('mg-bgkill')) continue;
    if (el.offsetWidth < rw * 0.6 || el.offsetHeight < 24) continue;
    const cs = getComputedStyle(el);
    const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    if (clear && cs.backgroundImage === 'none') continue;
    mgAdd(el, 'mg-bgkill');
  }
}

/* ================= COLORS: palettes + shared helpers =================
   The rainbow used all over the theme (top bar line, dividers, cover ring,
   play-button ring, progress bars, visualizer) is ONE active palette.
   The Colors page swaps it for any gradient or solid color.            */

const MG_PAGES = {};      // open/close handles, so only one page is open at a time

/* ---------- small color helpers ---------- */
function mgHex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mgToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function mgLighten(h) {
  const [r, g, b] = mgHex(h);
  return mgToHex(r + (255 - r) * 0.3, g + (255 - g) * 0.3, b + (255 - b) * 0.3);
}
const mgSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- the palettes: [name, colors..., [accent 1, accent 2]] ---------- */
const MG_GRADIENTS = [
  ['Rainbow',        ['#FF2D55', '#FF9500', '#FFE600', '#2BFF88', '#00E5FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00E5FF']],
  ['Neon Nights',    ['#FF00C8', '#7C4DFF', '#00E5FF'], ['#FF00C8', '#00E5FF']],
  ['Sunset',         ['#FF512F', '#F09819', '#FFD452'], ['#FF512F', '#FFD452']],
  ['Ocean',          ['#00C6FF', '#0072FF', '#5B2EFF'], ['#0072FF', '#00C6FF']],
  ['Aurora',         ['#00FFA3', '#00E5FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00FFA3']],
  ['Cyberpunk',      ['#FFEE00', '#FF2A6D', '#05D9E8'], ['#FF2A6D', '#05D9E8']],
  ['Vaporwave',      ['#FF71CE', '#B967FF', '#01CDFE', '#05FFA1'], ['#B967FF', '#01CDFE']],
  ['Lava',           ['#FF0000', '#FF5A00', '#FFC400'], ['#FF5A00', '#FFC400']],
  ['Toxic',          ['#B6FF00', '#00FF85', '#00B3FF'], ['#00FF85', '#B6FF00']],
  ['Ice',            ['#E0F7FF', '#7DD3FC', '#38BDF8', '#818CF8'], ['#38BDF8', '#818CF8']],
  ['Candy',          ['#FF9A9E', '#FBC2EB', '#A6C1EE'], ['#FF9A9E', '#A6C1EE']],
  ['Forest',         ['#0F9B0F', '#52C234', '#B8E986'], ['#52C234', '#B8E986']],
  ['Galaxy',         ['#4B2BFF', '#9D4EDD', '#FF2BD6', '#00E5FF'], ['#9D4EDD', '#00E5FF']],
  ['Inferno',        ['#FFE600', '#FF8A00', '#FF2D55', '#7A00FF'], ['#FF8A00', '#FF2D55']],
  ['Mint',           ['#00F5A0', '#00D9F5'], ['#00F5A0', '#00D9F5']],
  ['Peach',          ['#FFB88C', '#FF6B9D'], ['#FF6B9D', '#FFB88C']],
  ['Miami',          ['#FF2E97', '#00F0FF'], ['#FF2E97', '#00F0FF']],
  ['Synthwave',      ['#F72585', '#7209B7', '#3A0CA3', '#4CC9F0'], ['#F72585', '#4CC9F0']],
  ['Matrix',         ['#00FF41', '#00B82E', '#B6FFB6'], ['#00FF41', '#B6FFB6']],
  ['Gold',           ['#F7971E', '#FFD200', '#FFF3B0'], ['#F7971E', '#FFD200']],
  ['Rose Gold',      ['#FFC3A0', '#FFAFBD', '#FF6F91'], ['#FF6F91', '#FFC3A0']],
  ['Steel',          ['#8EA7BF', '#C9D6E3', '#5C7A99'], ['#8EA7BF', '#C9D6E3']],
  ['Blood Moon',     ['#FF0844', '#FF3D00', '#B3000F'], ['#FF0844', '#FF3D00']],
  ['Deep Space',     ['#00D2FF', '#3A47D5', '#8E2DE2'], ['#8E2DE2', '#00D2FF']],
  ['Tropical',       ['#00F260', '#0575E6', '#FFE000'], ['#00F260', '#0575E6']],
  ['Lemonade',       ['#F9D423', '#FF4E50'], ['#F9D423', '#FF4E50']],
  ['Berry',          ['#8E2DE2', '#FF2BD6', '#FF6A88'], ['#FF2BD6', '#FF6A88']],
  ['Emerald Sea',    ['#11998E', '#38EF7D', '#00B4DB'], ['#38EF7D', '#00B4DB']],
  ['Cotton Candy',   ['#FFC0E3', '#C0E3FF', '#E3C0FF'], ['#FFC0E3', '#C0E3FF']],
  ['Fire & Ice',     ['#FF3D00', '#FF8A00', '#00E5FF', '#2979FF'], ['#FF3D00', '#00E5FF']],
  ['Northern Lights', ['#43E97B', '#38F9D7', '#4FACFE', '#C471F5'], ['#43E97B', '#C471F5']],
  ['Bubblegum',      ['#FF6AC1', '#FF9BDC', '#8AD4FF'], ['#FF6AC1', '#8AD4FF']],
  ['Sakura',         ['#FFD1DC', '#FF9EB5', '#FF6F91'], ['#FF9EB5', '#FF6F91']],
  ['Midnight City',  ['#00C9FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00C9FF']],
  ['Gamer Green',    ['#39FF14', '#00FFC8', '#00B8FF'], ['#39FF14', '#00B8FF']],
  ['Ultraviolet',    ['#6A00F4', '#B100E8', '#FF00C8', '#00E5FF'], ['#B100E8', '#00E5FF']],
];

const MG_SOLIDS = [
  ['Red', '#FF3B30'], ['Crimson', '#DC143C'], ['Orange', '#FF9500'], ['Amber', '#FFB300'],
  ['Yellow', '#FFE600'], ['Lime', '#C6FF00'], ['Green', '#30D158'], ['Spotify Green', '#1ED760'],
  ['Emerald', '#10B981'], ['Mint', '#00F5A0'], ['Teal', '#14B8A6'], ['Cyan', '#00E5FF'],
  ['Sky', '#38BDF8'], ['Blue', '#2979FF'], ['Royal', '#3B5BFF'], ['Indigo', '#5E5CE6'],
  ['Violet', '#7C4DFF'], ['Purple', '#A855F7'], ['Magenta', '#FF2BD6'], ['Hot Pink', '#FF4FA3'],
  ['Pink', '#FF9EC4'], ['Rose', '#FF4D6D'], ['White', '#F2F2F5'], ['Silver', '#A8B0BC'],
];

const MG_PALETTES = [].concat(
  MG_GRADIENTS.map(([name, stops, a]) => ({ id: 'g-' + mgSlug(name), name, kind: 'gradient', stops, a })),
  MG_SOLIDS.map(([name, c]) => ({ id: 's-' + mgSlug(name), name, kind: 'solid', stops: [c, c], a: [c, mgLighten(c)] }))
);

let MG_PAL = null;       // the active palette

/* make a palette the active one: sets the CSS variables the whole theme uses */
function mgApply(p, save) {
  const loop = p.stops.concat(p.stops[0]);        // loops back to the first color -> seamless flow
  p.rgb = loop.map(mgHex);
  MG_PAL = p;
  if (!document.documentElement) {       // script ran before the page exists: apply once it does
    document.addEventListener('DOMContentLoaded', () => mgApply(p, false), { once: true });
    return;
  }
  const st = document.documentElement.style;
  const r1 = mgHex(p.a[0]).join(', ');
  const r2 = mgHex(p.a[1]).join(', ');
  st.setProperty('--mg-stops', loop.join(', '));
  st.setProperty('--mg-a1', p.a[0]);
  st.setProperty('--mg-a2', p.a[1]);
  st.setProperty('--mg-a1-rgb', r1);
  st.setProperty('--mg-a2-rgb', r2);
  // Spotify's own accents follow the palette too
  st.setProperty('--spice-button', p.a[0]);
  st.setProperty('--spice-rgb-button', r1);
  st.setProperty('--spice-button-active', p.a[1]);
  st.setProperty('--spice-rgb-button-active', r2);
  st.setProperty('--spice-selected-row', p.a[1]);
  st.setProperty('--spice-rgb-selected-row', r2);
  if (save) mgSaveId(p.id);
}

/* your pick is remembered across restarts: stored in two places, in case one is cleared */
function mgSaveId(id) {
  try { localStorage.setItem('mg-palette', id); } catch (e) {}
  try {
    const sp = window.Spicetify;
    if (sp && sp.LocalStorage && sp.LocalStorage.set) sp.LocalStorage.set('mg-palette', id);
  } catch (e) {}
}
function mgLoadId() {
  let id = null;
  try { id = localStorage.getItem('mg-palette'); } catch (e) {}
  if (!id) {
    try {
      const sp = window.Spicetify;
      if (sp && sp.LocalStorage && sp.LocalStorage.get) id = sp.LocalStorage.get('mg-palette');
    } catch (e) {}
  }
  return id;
}

/* color at position t (0..1, wraps) along the active gradient -> [r, g, b] */
function mgSample(t) {
  const s = MG_PAL.rgb;
  const x = (((t % 1) + 1) % 1) * (s.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = s[i], b = s[Math.min(s.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* Every rainbow spot in the theme, re-pointed at the active palette. Injected by the script
   (with !important) so it works even if an older user.css is still cached by Spicetify/Marketplace. */
const MG_THEME_COLOR_CSS = `
html:root{--mg-rgb:linear-gradient(90deg,var(--mg-stops)) !important;--mg-rgb-v:linear-gradient(180deg,var(--mg-stops)) !important}
@property --mg-a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes mg-angle{to{--mg-a:360deg}}
html body .mg-widget > .mg-cchain:not(:has(.mg-cimg))::before{display:none !important}
html body .mg-widget > .mg-cchain:has(.mg-cimg)::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-pm [data-testid="control-button-playpause"],
html body .main-playButton-PlayButton,
html body [data-testid="play-button"],
html body .main-card-PlayButtonContainer button{
  background:linear-gradient(135deg,var(--mg-a1),var(--mg-a2)) padding-box,conic-gradient(from var(--mg-a),var(--mg-stops)) border-box !important;
  box-shadow:0 6px 24px rgba(var(--mg-a1-rgb),.55) !important}
html body .mg-gn::after{box-shadow:0 0 12px rgba(var(--mg-a1-rgb),.6) !important}
html body .main-trackList-trackListRow:hover,html body .main-trackList-trackListRow:focus-within{box-shadow:inset 3px 0 0 var(--mg-a2) !important}
html body .main-trackList-trackListRow[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--mg-a1) !important}
html body .main-card-card:hover{box-shadow:0 0 0 1px rgba(var(--mg-a2-rgb),.55),0 12px 40px rgba(var(--mg-a1-rgb),.35) !important}
`;

function mgInjectThemeColors() {
  if (document.getElementById('mg-theme-colors')) return;
  const st = document.createElement('style');
  st.id = 'mg-theme-colors';
  st.textContent = MG_THEME_COLOR_CSS;
  const where = [document.head, document.documentElement].find((h) => h && h.appendChild);
  if (where) where.appendChild(st);
}

function mgInitPalette() {
  const id = mgLoadId();
  mgApply(MG_PALETTES.find((x) => x.id === id) || MG_PALETTES[0], false);
  mgInjectThemeColors();
}
mgInitPalette();           // restore the saved palette immediately, before anything is drawn

/* ---------- palette-driven rules, injected by the script ----------
   user.css may be an older cached copy with the rainbow hard-coded. These rules are
   injected with the script, so they always win and every rainbow spot follows the palette. */
const MG_THEME_CSS = `
@property --mg-a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes mg-angle{to{--mg-a:360deg}}
@keyframes mg-flow{from{background-position:0% 0}to{background-position:200% 0}}
@keyframes mg-flowv{from{background-position:0 0%}to{background-position:0 200%}}
html:root{--mg-rgb:linear-gradient(90deg,var(--mg-stops)) !important;--mg-rgb-v:linear-gradient(180deg,var(--mg-stops)) !important}
html body .mg-widget > .mg-cchain::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-widget > .mg-cchain:has(.mg-cimg)::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-pm [data-testid="control-button-playpause"],
html body .main-playButton-PlayButton,
html body [data-testid="play-button"],
html body .main-card-PlayButtonContainer button{box-sizing:border-box !important;border:3px solid transparent !important;background:linear-gradient(135deg,var(--mg-a1),var(--mg-a2)) padding-box,conic-gradient(from var(--mg-a),var(--mg-stops)) border-box !important;animation:mg-angle 4s linear infinite !important;box-shadow:0 6px 24px rgba(var(--mg-a1-rgb),.55) !important;filter:none !important}
html body .mg-fill{background-color:transparent !important;background-image:var(--mg-rgb) !important;background-size:200% 100% !important}
html body .mg-gn::after{background:var(--mg-rgb) !important;background-size:200% 100% !important;box-shadow:0 0 12px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-ls::after,html body .mg-main::after{background:var(--mg-rgb-v) !important;background-size:100% 200% !important}
html body .main-trackList-trackListRow:hover,html body .main-trackList-trackListRow:focus-within{box-shadow:inset 3px 0 0 var(--mg-a2) !important;background-color:rgba(var(--mg-a1-rgb),.10) !important}
html body .main-trackList-trackListRow[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--mg-a1) !important;background-color:rgba(var(--mg-a1-rgb),.20) !important}
html body .main-card-card:hover{box-shadow:0 0 0 1px rgba(var(--mg-a2-rgb),.55),0 12px 40px rgba(var(--mg-a1-rgb),.35) !important}
html body input:focus{outline-color:rgba(var(--mg-a2-rgb),.72) !important}
html body ::-webkit-scrollbar-thumb:hover{background:rgba(var(--mg-a2-rgb),.6) !important}
`;

function mgInjectThemeCss() {
  if (document.getElementById('mg-pal-theme-css')) return;
  const st = document.createElement('style');
  st.id = 'mg-pal-theme-css';
  st.textContent = MG_THEME_CSS;
  const host = [document.head, document.documentElement].find((h) => h && h.appendChild);
  if (host) host.appendChild(st);
  else document.addEventListener('DOMContentLoaded', mgInjectThemeCss, { once: true });
}
mgInjectThemeCss();         // ...and the rules that make every rainbow spot follow it


/* ---------- line the top-bar buttons up with the bell / avatar row ---------- */
function mgAlignButtons(top) {
  const nav = top.querySelector(':scope > .mg-gn');
  if (!nav || !nav.querySelectorAll) return;
  const vw = window.innerWidth;
  let best = null;
  for (const el of nav.querySelectorAll('button, a, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 18 || r.width > 56 || r.height < 18 || r.height > 56) continue;
    if (r.right < vw - 400 || r.right > vw - 130) continue;   // the right-hand icon group only
    if (!best || r.left < best.left) best = r;                 // leftmost of them = the bell
  }
  if (!best) return;
  const size = 32, gap = 6;
  const btns = [...top.querySelectorAll('.mg-topbtn')].sort((a, b) => (a._mgOrder || 0) - (b._mgOrder || 0));
  btns.forEach((b, i) => {
    b.style.top = Math.round(best.top + best.height / 2 - size / 2) + 'px';
    b.style.right = Math.round(vw - best.left + 8 + i * (size + gap)) + 'px';
  });
}

function mgCloseOthers(me) {
  Object.keys(MG_PAGES).forEach((k) => { if (k !== me) MG_PAGES[k].close(); });
}

/* ================= THE COLORS PAGE ================= */
const MG_PAL_CSS = `
#mg-pal-btn{position:fixed;top:12px;right:340px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-pal-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-pal-btn.on{color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF));box-shadow:0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.6)}
#mg-palpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-palpage .mg-pal-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden}
#mg-palpage .mg-pal-wrap{max-width:1100px;margin:0 auto;padding:30px 36px 56px}
#mg-palpage .mg-pal-title{font-size:34px;font-weight:800;letter-spacing:-.01em;line-height:1.15}
#mg-palpage .mg-pal-sub{margin:8px 0 22px;font-size:15px;color:#BDBDCB}
#mg-palpage .mg-pal-preview{height:10px;border-radius:999px;margin-bottom:6px;background:linear-gradient(90deg,var(--mg-stops,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55));background-size:200% 100%;animation:mgp-flow 6s linear infinite;box-shadow:0 0 18px rgba(var(--mg-a1-rgb,124,77,255),.5)}
#mg-palpage .mg-pal-h{margin:30px 0 14px;font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#A8A8B3}
#mg-palpage .mg-pal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
#mg-palpage .mg-pal-card{display:block;width:100%;padding:10px;margin:0;border-radius:14px;border:2px solid transparent;background:#1C1C20;color:#fff;text-align:left;cursor:pointer;transition:background-color .15s ease,transform .15s ease,border-color .15s ease,box-shadow .15s ease}
#mg-palpage .mg-pal-card:hover{background:#25252B;transform:translateY(-2px)}
#mg-palpage .mg-pal-card.sel{border-color:var(--mg-a2,#00E5FF);box-shadow:0 0 16px rgba(var(--mg-a2-rgb,0,229,255),.45)}
#mg-palpage .mg-pal-sw{height:54px;border-radius:9px;background-size:200% 100%}
#mg-palpage .mg-pal-sw.flow{animation:mgp-flow 6s linear infinite}
#mg-palpage .mg-pal-name{margin-top:9px;font-size:13px;font-weight:600;color:#F2F2F5}
#mg-palpage .mg-pal-reset{margin-top:34px}
#mg-palpage .mg-pal-act{padding:10px 18px;border-radius:999px;border:0;font-size:13px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF))}
#mg-palpage .mg-pal-act.ghost{background:rgba(255,255,255,.08);color:#E4E4EE}
#mg-palpage .mg-pal-act:hover{filter:brightness(1.12)}
#mg-palpage .mg-pal-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:2}
#mg-palpage .mg-pal-close:hover{color:var(--mg-a2,#00E5FF);border-color:var(--mg-a2,#00E5FF)}
@keyframes mgp-flow{from{background-position:0% 0}to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){#mg-palpage .mg-pal-preview,#mg-palpage .mg-pal-sw.flow{animation:none!important}}
`;

function startPalette(top) {
  if (!MG_COLORS_ENABLED || document.getElementById('mg-palpage')) return;
  mgInjectThemeCss();

  const style = document.createElement('style');
  style.id = 'mg-pal-style';
  style.textContent = MG_PAL_CSS;
  const host = [document.head, document.documentElement, top].find((h) => h && h.appendChild);
  if (host) host.appendChild(style);

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  /* top-bar button */
  const btn = document.createElement('button');
  btn.id = 'mg-pal-btn';
  btn.className = 'mg-topbtn';
  btn._mgOrder = 1;
  btn.style.cssText = 'position:fixed;top:12px;right:340px;width:32px;height:32px;';
  btn.setAttribute('aria-label', 'Colors');
  btn.title = 'Colors (Ctrl+Alt+C)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">'
    + '<path d="M8 1a7 7 0 1 0 0 14c1.1 0 1.6-.8 1.3-1.7-.3-.9.2-1.8 1.2-1.8H12a3 3 0 0 0 3-3C15 4 12 1 8 1z'
    + 'M4.5 8.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3.5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z'
    + 'm2.5 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
  top.appendChild(btn);

  /* page */
  const page = document.createElement('div');
  page.id = 'mg-palpage';
  page.style.cssText = 'position:fixed;display:none;';   // out of the page grid even before any CSS loads
  const scroll = mk('div', 'mg-pal-scroll');
  const wrap = mk('div', 'mg-pal-wrap');
  const closeBtn = mk('button', 'mg-pal-close', '\u2715');
  closeBtn.setAttribute('aria-label', 'Close colors');

  wrap.appendChild(mk('div', 'mg-pal-title', 'Colors'));
  wrap.appendChild(mk('div', 'mg-pal-sub', 'Pick a gradient or a solid color to use instead of the rainbow. It applies everywhere in the theme, and your choice is saved.'));
  wrap.appendChild(mk('div', 'mg-pal-preview'));

  const cards = [];
  const addGrid = (heading, list) => {
    wrap.appendChild(mk('div', 'mg-pal-h', heading));
    const grid = mk('div', 'mg-pal-grid');
    list.forEach((p) => {
      const card = mk('button', 'mg-pal-card');
      card.setAttribute('data-id', p.id);
      const sw = mk('div', 'mg-pal-sw' + (p.kind === 'gradient' ? ' flow' : ''));
      if (p.kind === 'gradient') sw.style.backgroundImage = 'linear-gradient(90deg,' + p.stops.concat(p.stops[0]).join(',') + ')';
      else sw.style.backgroundColor = p.stops[0];
      card.appendChild(sw);
      card.appendChild(mk('div', 'mg-pal-name', p.name));
      card.addEventListener('click', () => { mgApply(p, true); refreshSel(); });
      grid.appendChild(card);
      cards.push(card);
    });
    wrap.appendChild(grid);
  };
  addGrid('Gradients', MG_PALETTES.filter((p) => p.kind === 'gradient'));
  addGrid('Solid colors', MG_PALETTES.filter((p) => p.kind === 'solid'));

  const reset = mk('div', 'mg-pal-reset');
  const resetBtn = mk('button', 'mg-pal-act ghost', 'Reset to rainbow');
  reset.appendChild(resetBtn);
  wrap.appendChild(reset);

  scroll.appendChild(wrap);
  page.appendChild(scroll);
  page.appendChild(closeBtn);
  top.appendChild(page);

  function refreshSel() {
    cards.forEach((c) => c.classList.toggle('sel', c.getAttribute('data-id') === MG_PAL.id));
  }

  resetBtn.addEventListener('click', () => { mgApply(MG_PALETTES[0], true); refreshSel(); });

  /* open / close */
  let isOpen = false;
  function place() {
    const main = top.querySelector(':scope > .mg-main');
    const r = main && main.getBoundingClientRect
      ? main.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    page.style.left = r.left + 'px';
    page.style.top = r.top + 'px';
    page.style.width = Math.max(200, Math.round(r.width)) + 'px';
    page.style.height = Math.max(200, Math.round(r.height)) + 'px';
  }
  function open() {
    mgCloseOthers('pal');
    place();
    refreshSel();
    isOpen = true;
    page.style.display = 'block';
    page.classList.add('open');
    btn.classList.add('on');
  }
  function close() {
    isOpen = false;
    page.style.display = 'none';
    page.classList.remove('open');
    btn.classList.remove('on');
  }
  const toggle = () => (isOpen ? close() : open());
  MG_PAGES.pal = { close };

  btn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { close(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'c') toggle();
  });
  window.addEventListener('resize', () => { if (isOpen) place(); });

  (function whenReady(tries) {
    const sp = window.Spicetify;
    if (sp && sp.Platform && sp.Platform.History && sp.Platform.History.listen) {
      try { sp.Platform.History.listen(close); } catch (e) {}   // opening any other page closes ours
    } else if (tries > 0) {
      setTimeout(whenReady, 300, tries - 1);
    }
  })(100);

  // Spicetify's storage becomes available a moment after load: re-check the saved choice
  setTimeout(() => { const id = mgLoadId(); const p = MG_PALETTES.find((x) => x.id === id); if (p && p.id !== MG_PAL.id) { mgApply(p, false); refreshSel(); } }, 1500);

  refreshSel();
}

/* ================= VISUALIZER PAGE =================
   A page over the main area (top-bar button or Ctrl+Alt+V, Esc closes):
   cover, song info, progress bar and a neon radial visualizer.
   It follows Spotify's analysis of the playing track (beats, loudness,
   pitch) in time with playback; it does not hear your speakers. Tracks
   without analysis get a generated beat animation.                      */
const MG_VIZ_CSS = `
#mg-viz-btn{position:fixed;top:12px;right:300px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-viz-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-viz-btn.on{color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF));box-shadow:0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.6)}
#mg-vizpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-vizpage canvas{position:absolute;inset:0;width:100%;height:100%}
#mg-vizpage .mg-vp-cover{position:absolute;left:50%;border-radius:50%;object-fit:cover;background:#141416;box-shadow:0 0 0 3px #141416,0 0 0 8px rgba(var(--mg-a1-rgb,124,77,255),.55),0 0 60px rgba(var(--mg-a1-rgb,124,77,255),.45);animation:mgv-spin 28s linear infinite;animation-play-state:paused}
#mg-vizpage .mg-vp-info{position:absolute;left:50%;transform:translateX(-50%);width:min(560px,80%);text-align:center}
#mg-vizpage .mg-vp-title{font-size:36px;font-weight:800;letter-spacing:-.01em;line-height:1.15;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-artist{font-size:19px;font-weight:600;margin-top:8px;color:#E4E4EE;text-shadow:0 1px 12px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-album{font-size:14px;margin-top:4px;color:#BDBDCB;text-shadow:0 1px 10px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-prog{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:13px;font-weight:600;color:#D6D6E2;font-variant-numeric:tabular-nums}
#mg-vizpage .mg-vp-bar{flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.24);overflow:hidden}
#mg-vizpage .mg-vp-fill{height:100%;width:0;background:linear-gradient(90deg,var(--mg-stops,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55));background-size:200% 100%;animation:mgv-flow 5s linear infinite}
#mg-vizpage .mg-vp-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:2}
#mg-vizpage .mg-vp-close:hover{color:var(--mg-a2,#00E5FF);border-color:var(--mg-a2,#00E5FF)}
@keyframes mgv-spin{to{transform:rotate(360deg)}}
@keyframes mgv-flow{from{background-position:0% 0}to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){#mg-vizpage .mg-vp-cover,#mg-vizpage .mg-vp-fill{animation:none!important}}
`;

// The visualizer styles itself, so it can never show up unstyled (or leak into
// the page grid) even if an older user.css is still cached by Spicetify/Marketplace.
function mgInjectVizStyle(host) {
  if (document.getElementById('mg-viz-style')) return;
  const st = document.createElement('style');
  st.id = 'mg-viz-style';
  st.textContent = MG_VIZ_CSS;
  const where = [document.head, document.documentElement, host].find((h) => h && h.appendChild);
  if (where) where.appendChild(st);
}

function startVisualizer(top) {
  if (!MG_VIZ_ENABLED || document.getElementById('mg-vizpage')) return;

  const N = 56;                          // bars
  const PAGE_CY = 0.34;                  // vertical centre of the cover on the page (fraction of height)
  const levels = new Float32Array(N);
  const target = new Float32Array(N);
  const cache = new Map();
  let analysis = null, analysisUri = '';
  let playing = false, beatPulse = 0, loud = 0, peak = 0;
  let raf = 0, last = 0, lastKey = '';
  let pageOpen = false;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function findIdx(arr, t) {             // last index whose .start <= t
    let lo = 0, hi = arr.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /* ---------- visualizer page ---------- */
  mgInjectVizStyle(top);
  const page = document.createElement('div');
  page.id = 'mg-vizpage';
  page.style.cssText = 'position:fixed;display:none;';   // out of the page grid even before any CSS loads
  const pc = document.createElement('canvas');
  const cover = document.createElement('img');
  cover.className = 'mg-vp-cover';
  const info = document.createElement('div');
  info.className = 'mg-vp-info';
  const title = document.createElement('div');
  title.className = 'mg-vp-title';
  const artist = document.createElement('div');
  artist.className = 'mg-vp-artist';
  const album = document.createElement('div');
  album.className = 'mg-vp-album';
  const prog = document.createElement('div');
  prog.className = 'mg-vp-prog';
  const tNow = document.createElement('span');
  const bar = document.createElement('div');
  bar.className = 'mg-vp-bar';
  const fill = document.createElement('div');
  fill.className = 'mg-vp-fill';
  const tEnd = document.createElement('span');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'mg-vp-close';
  closeBtn.setAttribute('aria-label', 'Close visualizer');
  closeBtn.textContent = '\u2715';
  bar.appendChild(fill);
  prog.appendChild(tNow); prog.appendChild(bar); prog.appendChild(tEnd);
  info.appendChild(title); info.appendChild(artist); info.appendChild(album); info.appendChild(prog);
  page.appendChild(pc); page.appendChild(cover); page.appendChild(info); page.appendChild(closeBtn);
  top.appendChild(page);
  const pCtx = pc.getContext('2d');
  const P_SCALE = 0.6;
  let pW = 2, pH = 2, pageR = 120, cw = 800, ch = 600;

  // top-bar button
  const btn = document.createElement('button');
  btn.id = 'mg-viz-btn';
  btn.className = 'mg-topbtn';
  btn._mgOrder = 0;                    // nearest the bell
  btn.style.cssText = 'position:fixed;top:12px;right:300px;width:32px;height:32px;';
  btn.setAttribute('aria-label', 'Visualizer');
  btn.title = 'Visualizer (Ctrl+Alt+V)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">'
    + '<rect x="1" y="8" width="3" height="7" rx="1"/><rect x="6.5" y="1.5" width="3" height="13.5" rx="1"/>'
    + '<rect x="12" y="5" width="3" height="10" rx="1"/></svg>';
  top.appendChild(btn);

  function placePage() {
    const main = top.querySelector(':scope > .mg-main');
    const r = main && main.getBoundingClientRect
      ? main.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    cw = Math.max(200, Math.round(r.width));
    ch = Math.max(200, Math.round(r.height));
    page.style.left = r.left + 'px';
    page.style.top = r.top + 'px';
    page.style.width = cw + 'px';
    page.style.height = ch + 'px';
    pW = Math.max(2, Math.floor(cw * P_SCALE));
    pH = Math.max(2, Math.floor(ch * P_SCALE));
    pc.width = pW;
    pc.height = pH;
    pageR = Math.max(70, Math.min(130, ch * 0.17));
    cover.style.width = cover.style.height = pageR * 2 + 'px';
    cover.style.marginLeft = cover.style.marginTop = -pageR + 'px';
    cover.style.top = ch * PAGE_CY + 'px';
    // song info sits BELOW the longest bars / expanding beat ring so nothing crosses the text
    info.style.top = ch * PAGE_CY + pageR + 14 + Math.min(cw, ch) * 0.15 * 1.45 + 14 + 'px';
  }

  /* ---------- track info ---------- */
  function readTrack() {
    const sp = window.Spicetify;
    const d = sp && sp.Player && sp.Player.data;
    const it = (d && (d.item || d.track)) || {};
    const md = it.metadata || {};
    const name = it.name || md.title || '';
    const artists = Array.isArray(it.artists) && it.artists.length
      ? it.artists.map((a) => a.name).join(', ')
      : md.artist_name || '';
    const albumName = (it.album && it.album.name) || md.album_title || '';
    const img = document.querySelector('.mg-cimg');
    let src = img && img.src ? img.src : '';
    if (!src) {
      const u = (it.images && it.images[0] && it.images[0].url) || md.image_xlarge_url || '';
      src = u.indexOf('spotify:image:') === 0 ? 'https://i.scdn.co/image/' + u.slice(14) : u;
    }
    return { uri: it.uri || '', name, artists, albumName, src };
  }

  function updateInfo(force) {
    const t = readTrack();
    const key = t.uri + '|' + t.name + '|' + t.src;
    if (!force && key === lastKey) return;
    lastKey = key;
    title.textContent = t.name;
    artist.textContent = t.artists;
    album.textContent = t.albumName;
    if (t.src && cover.src !== t.src) cover.src = t.src;
  }

  function updateProgress() {
    const sp = window.Spicetify;
    if (!sp || !sp.Player) return;
    const p = sp.Player.getProgress ? sp.Player.getProgress() : 0;
    const dur = sp.Player.getDuration ? sp.Player.getDuration() : 0;
    tNow.textContent = fmt(p);
    tEnd.textContent = fmt(dur);
    fill.style.width = dur > 0 ? clamp01(p / dur) * 100 + '%' : '0%';
  }

  async function loadAnalysis() {
    const sp = window.Spicetify;
    if (!sp || !sp.getAudioData) return;
    const uri = readTrack().uri;
    if (!uri || uri === analysisUri) return;
    analysisUri = uri;
    if (cache.has(uri)) { analysis = cache.get(uri); return; }
    analysis = null;
    try {
      const data = await sp.getAudioData(uri);
      const ok = data && Array.isArray(data.segments) && data.segments.length ? data : null;
      cache.set(uri, ok);
      if (analysisUri === uri) analysis = ok;
    } catch (e) {
      console.debug('[Modern Gamer] no audio analysis for this track, using generated animation', e);
      cache.set(uri, null);
    }
  }

  /* ---------- audio engine ---------- */
  function computeTargets(now) {
    const sp = window.Spicetify;
    const progS = sp && sp.Player && sp.Player.getProgress ? sp.Player.getProgress() / 1000 : 0;
    let pulse = 0, level = 0;
    target.fill(playing ? 0.03 : 0);     // paused: bars sink to nothing so the loop can stop

    if (!playing) { beatPulse *= 0.9; loud *= 0.9; return; }

    if (analysis) {
      const segs = analysis.segments;
      const s = segs[findIdx(segs, progS)];
      const into = progS - s.start;
      const pk = s.loudness_max_time || 0;
      const decay = clamp01((into - pk) / Math.max(s.duration - pk, 0.05));
      level = clamp01(((s.loudness_max || -30) + 50) / 50) * (1 - 0.3 * decay);
      const p = s.pitches || [];
      const tb = s.timbre || [];
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 11;
        const a = Math.floor(x), b = Math.min(11, a + 1), f = x - a;
        const pv = (p[a] ?? 0.5) * (1 - f) + (p[b] ?? 0.5) * f;
        const wob = 0.12 * Math.sin(i * 1.7 + progS * 9 + (tb[1] || 0) * 0.02);
        target[i] = clamp01(level * (0.35 + 0.75 * pv) + wob * level + 0.03);
      }
      const beats = analysis.beats;
      if (beats && beats.length) {
        const bt = beats[findIdx(beats, progS)];
        const since = progS - bt.start;
        pulse = since >= 0 ? Math.exp(-since * 7) * (0.5 + 0.5 * (bt.confidence ?? 1)) : 0;
      }
    } else {
      const ph = ((now / 1000) * 2) % 1;  // generated: steady 120 bpm
      pulse = Math.exp(-ph * 6);
      level = 0.55 + 0.2 * Math.sin(now / 1700);
      for (let i = 0; i < N; i++) {
        const n = (Math.sin(i * 0.7 + now / 260) + Math.sin(i * 1.9 - now / 410) + 2) / 4;
        target[i] = clamp01(level * (0.3 + 0.8 * n) + 0.03);
      }
    }

    beatPulse = Math.max(pulse, beatPulse * 0.8);
    loud = level;
    for (let i = 0; i < N; i++) target[i] = clamp01(target[i] * (1 + 0.35 * pulse));
  }

  function step(now) {
    const sp = window.Spicetify;
    playing = !!(sp && sp.Player && sp.Player.isPlaying && sp.Player.isPlaying());
    computeTargets(now);
    peak = 0;
    for (let i = 0; i < N; i++) {
      const t = target[i];
      levels[i] += (t - levels[i]) * (t > levels[i] ? 0.5 : 0.12);
      if (levels[i] > peak) peak = levels[i];
    }
  }

  /* ---------- painting ---------- */
  function paintRadial(ctx, W, H, hue0) {
    const M = 120;
    const cx = W / 2, cy = H * PAGE_CY;
    const R = pageR * P_SCALE;
    const r0 = R + 14 * P_SCALE;
    const maxLen = Math.min(W, H) * 0.15;
    ctx.lineCap = 'round';
    for (let k = 0; k < M; k++) {
      const m = Math.abs((k / M) * 2 - 1) * (N - 1);   // mirrored left/right
      const i0 = Math.floor(m), i1 = Math.min(N - 1, i0 + 1), f = m - i0;
      const v = levels[i0] * (1 - f) + levels[i1] * f;
      const len = 4 * P_SCALE + v * maxLen * (1 + 0.4 * beatPulse);
      const a = (k / M) * Math.PI * 2 - Math.PI / 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      const c = mgSample(k / M + hue0 / 360);          // active palette, flowing around the ring
      const col = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
      ctx.strokeStyle = `rgba(${col},0.95)`;
      ctx.shadowColor = `rgb(${col})`;
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(2, 3.2 * P_SCALE);
      ctx.beginPath();
      ctx.moveTo(cx + cs * r0, cy + sn * r0);
      ctx.lineTo(cx + cs * (r0 + len), cy + sn * (r0 + len));
      ctx.stroke();
    }
    // shock ring that expands on every beat
    ctx.shadowBlur = 14;
    const c0 = mgSample(hue0 / 360);
    const col0 = `${c0[0] | 0},${c0[1] | 0},${c0[2] | 0}`;
    ctx.shadowColor = `rgb(${col0})`;
    ctx.strokeStyle = `rgba(${col0},${clamp01(beatPulse * 0.6)})`;
    ctx.lineWidth = 2 * P_SCALE;
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + (1 - beatPulse) * maxLen * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function draw(now) {
    step(now);
    const hue0 = (now / 45) % 360;

    if (pageOpen) {
      pCtx.setTransform(1, 0, 0, 1, 0, 0);
      pCtx.clearRect(0, 0, pW, pH);
      pCtx.globalCompositeOperation = 'lighter';
      paintRadial(pCtx, pW, pH, hue0);
      pCtx.globalCompositeOperation = 'source-over';
      cover.style.animationPlayState = playing ? 'running' : 'paused';
      updateInfo(false);
      updateProgress();
    }
  }

  function loop(now) {
    raf = 0;
    if (!pageOpen) return;
    if (now - last >= 20) { last = now; draw(now); }
    const idle = !playing && peak < 0.012 && beatPulse < 0.01;
    if (!idle && !document.hidden) raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (!raf && pageOpen && !document.hidden) raf = requestAnimationFrame(loop);
  }

  /* ---------- open / close ---------- */
  function openPage() {
    mgCloseOthers('viz');
    placePage();
    updateInfo(true);
    updateProgress();
    pageOpen = true;
    page.style.display = 'block';
    page.classList.add('open');
    btn.classList.add('on');
    loadAnalysis();
    kick();
  }

  function closePage() {
    pageOpen = false;
    page.style.display = 'none';
    page.classList.remove('open');
    btn.classList.remove('on');
    kick();
  }

  MG_PAGES.viz = { close: closePage };

  function togglePage() { if (pageOpen) closePage(); else openPage(); }

  btn.addEventListener('click', togglePage);
  closeBtn.addEventListener('click', closePage);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pageOpen) { closePage(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'v') togglePage();
  });

  window.addEventListener('resize', () => { if (pageOpen) placePage(); kick(); });
  document.addEventListener('visibilitychange', kick);

  // hook into the player once Spicetify is ready
  (function whenReady(tries) {
    const sp = window.Spicetify;
    if (sp && sp.Player && sp.Player.addEventListener) {
      sp.Player.addEventListener('songchange', () => { loadAnalysis(); if (pageOpen) updateInfo(true); kick(); });
      sp.Player.addEventListener('onplaypause', kick);
      try {
        if (sp.Platform && sp.Platform.History && sp.Platform.History.listen) {
          sp.Platform.History.listen(closePage);   // opening any other page closes ours
        }
      } catch (e) {}
      loadAnalysis();
      kick();
    } else if (tries > 0) {
      setTimeout(whenReady, 300, tries - 1);
    }
  })(100);

  kick();
}

waitForElement([MG_TOP], ([top]) => {
  let refs = tagPanels(top);
  startVisualizer(top);
  startPalette(top);
  mgAlignButtons(top);                // lines the top-bar buttons up with the bell
  setInterval(() => mgAlignButtons(top), 1500);
  window.addEventListener('resize', () => mgAlignButtons(top));

  const refresh = () => {
    refs = tagPanels(top);
    tagPlayer(refs.bar);
  };
  const slowRefresh = () => {
    flatten(refs.rightbar);
    killBackdrops(top.querySelector(':scope > .mg-main'));
    clearBars(top.querySelector(':scope > .mg-gn'));
  };
  const refreshSoon = debounce(refresh, 250);
  const slowSoon = debounce(slowRefresh, 700);

  refresh();
  slowRefresh();
  new MutationObserver(() => { refreshSoon(); slowSoon(); }).observe(top, { childList: true, subtree: true });

  // Spotify's re-renders can overwrite an element's class attribute and wipe our tags
  // (the cover then loses its styling). Watch class changes around the panels/player and re-tag.
  const reTag = debounce(() => { refs = tagPanels(top); tagPlayer(refs.bar); }, 80);
  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (t === top || t.parentElement === top || (t.closest && t.closest('.mg-npb'))) { reTag(); break; }
    }
  }).observe(top, { attributes: true, attributeFilter: ['class'], subtree: true });

  // Spotify mounts things over time; keep retrying for a while
  let tries = 0;
  const retry = setInterval(() => {
    refresh();
    slowRefresh();
    if (++tries > 40) clearInterval(retry);
  }, 500);

  // spin the cover while music plays, pause when paused
  waitForElement(['[data-testid="control-button-playpause"]'], ([btn]) => {
    const update = () => {
      const on = btn.getAttribute('aria-label') === 'Pause';
      document.querySelectorAll('.mg-cimg').forEach((img) => img.classList.toggle('running-animation', on));
    };
    new MutationObserver(update).observe(btn, {
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    setInterval(update, 1000);
    update();
  });
});

})();
