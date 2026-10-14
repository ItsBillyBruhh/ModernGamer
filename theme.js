(function () {
  if (window.__modernGamerLoaded) return;   // Marketplace may load this twice
  window.__modernGamerLoaded = true;

  // ---- settings you can edit ----
  const MG_VIZ_ENABLED = true;        // false = no visualizer

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

/* ================= VISUALIZER PAGE =================
   A page over the main area (top-bar button or Ctrl+Alt+V, Esc closes):
   cover, song info, progress bar and a neon radial visualizer.
   It follows Spotify's analysis of the playing track (beats, loudness,
   pitch) in time with playback; it does not hear your speakers. Tracks
   without analysis get a generated beat animation.                      */
const MG_VIZ_CSS = `
#mg-viz-btn{position:fixed;top:12px;right:300px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-viz-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-viz-btn.on{color:#fff;background:linear-gradient(135deg,#7C4DFF,#00E5FF);box-shadow:0 0 14px rgba(124,77,255,.6)}
#mg-vizpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-vizpage canvas{position:absolute;inset:0;width:100%;height:100%}
#mg-vizpage .mg-vp-cover{position:absolute;left:50%;border-radius:50%;object-fit:cover;background:#141416;box-shadow:0 0 0 3px #141416,0 0 0 8px rgba(124,77,255,.55),0 0 60px rgba(124,77,255,.45);animation:mgv-spin 28s linear infinite;animation-play-state:paused}
#mg-vizpage .mg-vp-info{position:absolute;left:50%;transform:translateX(-50%);width:min(560px,80%);text-align:center}
#mg-vizpage .mg-vp-title{font-size:36px;font-weight:800;letter-spacing:-.01em;line-height:1.15;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-artist{font-size:19px;font-weight:600;margin-top:8px;color:#E4E4EE;text-shadow:0 1px 12px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-album{font-size:14px;margin-top:4px;color:#BDBDCB;text-shadow:0 1px 10px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-prog{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:13px;font-weight:600;color:#D6D6E2;font-variant-numeric:tabular-nums}
#mg-vizpage .mg-vp-bar{flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.24);overflow:hidden}
#mg-vizpage .mg-vp-fill{height:100%;width:0;background:linear-gradient(90deg,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55);background-size:200% 100%;animation:mgv-flow 5s linear infinite}
#mg-vizpage .mg-vp-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:2}
#mg-vizpage .mg-vp-close:hover{color:#00E5FF;border-color:#00E5FF}
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

  // match the bell / avatar icons: same centre line, sitting just left of them
  function alignBtn() {
    const nav = top.querySelector(':scope > .mg-gn');
    if (!nav || !nav.querySelectorAll) return;
    const vw = window.innerWidth;
    let best = null;
    for (const el of nav.querySelectorAll('button, a, [role="button"]')) {
      if (el === btn) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 18 || r.width > 56 || r.height < 18 || r.height > 56) continue;
      if (r.right < vw - 400 || r.right > vw - 130) continue;   // the right-hand icon group only
      if (!best || r.left < best.left) best = r;                 // leftmost of them = the bell
    }
    if (!best) return;
    const size = 32;
    btn.style.top = Math.round(best.top + best.height / 2 - size / 2) + 'px';
    btn.style.right = Math.round(vw - best.left + 8) + 'px';
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
      const hue = (hue0 + (k / M) * 360) % 360;
      ctx.strokeStyle = `hsla(${hue},100%,62%,0.95)`;
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(2, 3.2 * P_SCALE);
      ctx.beginPath();
      ctx.moveTo(cx + cs * r0, cy + sn * r0);
      ctx.lineTo(cx + cs * (r0 + len), cy + sn * (r0 + len));
      ctx.stroke();
    }
    // shock ring that expands on every beat
    ctx.shadowBlur = 14;
    ctx.shadowColor = `hsl(${hue0},100%,60%)`;
    ctx.strokeStyle = `hsla(${hue0},100%,70%,${clamp01(beatPulse * 0.6)})`;
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

  function togglePage() { if (pageOpen) closePage(); else openPage(); }

  btn.addEventListener('click', togglePage);
  closeBtn.addEventListener('click', closePage);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pageOpen) { closePage(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'v') togglePage();
  });

  alignBtn();
  setInterval(alignBtn, 1500);
  window.addEventListener('resize', () => { alignBtn(); if (pageOpen) placePage(); kick(); });
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
