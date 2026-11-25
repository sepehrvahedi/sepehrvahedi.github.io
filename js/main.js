// Everything on the page reads fine without this file. It adds the live parts:
//   the portrait drawn as text, the city that runs Dijkstra when you tap it, the throughput lanes,
//   the rate limiter, the Codeforces chart, the theme switch, a command line (press ":") and j/k navigation.
// No libraries. Each canvas only animates while it is on screen, and not at all with reduced motion on.
"use strict";

const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll("main section")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const easeOut = (t) => 1 - (1 - t) ** 3;

// Calls back with true/false as an element enters or leaves the screen.
function onVisible(el, callback, margin = "0px") {
  if (!("IntersectionObserver" in window)) { callback(true); return; }
  new IntersectionObserver((entries) => entries.forEach((e) => callback(e.isIntersecting)), { rootMargin: margin }).observe(el);
}

// ------------------------------------------------------------------ bar charts draw once, when first seen
document.querySelectorAll(".chart").forEach((el) => {
  if (reduceMotion) { el.classList.add("drawn"); return; }
  onVisible(el, (v) => v && el.classList.add("drawn"), "0px 0px -20% 0px");
});

// ------------------------------------------------------------------ theme
const root = document.documentElement;
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const currentTheme = () => root.dataset.theme || (systemDark() ? "dark" : "light");
function setTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch (e) { /* private mode: the choice lasts until reload */ }
}
$("#theme").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

// ------------------------------------------------------------------ header on phones
// Clear over the black hero at the top; it gains its bar once you scroll, and the name appears in it
// only after the big name below the portrait has scrolled away (the way iOS collapses a large title).
(() => {
  const nav = $(".nav"), name = $(".name");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 6);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if (name && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => nav.classList.toggle("titled", !e.isIntersecting && e.boundingClientRect.top < 60),
      { rootMargin: "-48px 0px 0px 0px" }).observe(name);
  } else nav.classList.add("titled");
})();

// ------------------------------------------------------------------ mark the current section in the nav
const navLinks = new Map([...document.querySelectorAll(".nav-links a")].map((a) => [a.getAttribute("href").slice(1), a]));
let current = 0;
if ("IntersectionObserver" in window) {
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      current = sections.indexOf(e.target);
      for (const [id, a] of navLinks) a.toggleAttribute("aria-current", id === e.target.id);
    }
  }, { rootMargin: "-30% 0px -60% 0px" });
  sections.forEach((s) => spy.observe(s));
}
function go(index) {
  current = clamp(index, 0, sections.length - 1);
  sections[current].scrollIntoView({ block: "start" });
}

// ==================================================================== the portrait, drawn as text
// The photo is sampled into a grid. It is a bright sunset, so darkness picks the character: hair,
// sunglasses, jacket and the clock tower come out dense, the sky stays empty. A little local contrast
// keeps the curls. A person mask (made offline with Apple's Vision framework) gives the outline.
// Big Ben's clock face is redrawn every second in finer characters with London time, and a digital
// clock sits in the sky beside it. Tap (or drag sideways) and the real photo shows through soft spots
// that dissolve back into text; with a mouse, a lens follows the pointer.
const portrait = (() => {
  const fig = $("#ascii");
  if (!fig) return null;
  const img = fig.querySelector("img"), canvas = fig.querySelector("canvas"), note = $("#ascii-note");
  fig.classList.add("pending");   // the script is here: keep the photo hidden however long it takes to load
  const ctx = canvas.getContext("2d");
  const RAMP = " .:-=+*#%@";
  const NOISE = "01<>/\\|{}[]*+=-:;#%&$?";
  const ACCENT = "#2997ff";
  const GROW = 450, HOLD = 1400, FADE = 1700;      // ms for each tap's reveal
  const TEXT = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:\u2588";
  const BLOCK = "\u2588";
  const CHARS = RAMP + NOISE + TEXT;
  const at = (c) => CHARS.indexOf(c);
  const CLOCK = { x: 0.79, y: 0.183, r: 0.0568 };   // Big Ben's face, as fractions of the photo's width and height
  // 3 x 5 digits for the digital clock; each "pixel" is two characters wide
  const DIGITS = ["###/#.#/#.#/#.#/###", ".#./##./.#./.#./###", "###/..#/###/#../###", "###/..#/###/..#/###", "#.#/#.#/###/..#/..#",
    "###/#../###/..#/###", "###/#../###/#.#/###", "###/..#/..#/..#/..#", "###/#.#/###/#.#/###", "###/#.#/###/..#/###"].map((d) => d.split("/"));
  const maskImg = new Image();
  const maskReady = new Promise((ok) => { maskImg.onload = ok; maskImg.onerror = ok; });
  maskImg.src = "assets/img/portrait-london-mask.png";

  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cw = 0, ch = 0, oy = 0;
  let glyph, delay, dither, outline, reserved, outlineDelay, clock = null, digital = null, atlas, mask, mctx, start = 0, raf = 0, visible = true, built = false, count = 0, tapped = false;
  let lens = null;          // { x, y, r, target } for a mouse
  const taps = [];          // { x, y, t0, max }
  let scan = null;          // { t0 } an occasional glitch line, so it never looks like a still image

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[y * w + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / n;
        s += src[y * w + Math.min(x + r + 1, w - 1)] - src[y * w + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }

  function build() {
    W = canvas.clientWidth; H = canvas.clientHeight; dpr = DPR();
    if (!W || !H) return false;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    mask = document.createElement("canvas"); mask.width = canvas.width; mask.height = canvas.height;
    mctx = mask.getContext("2d");

    // cell size: about 4.3 px wide on a phone, 6.4 px on a laptop; height follows the font's aspect
    ctx.font = `100px ${getComputedStyle(note).fontFamily}`;
    const aspect = ctx.measureText("M").width / 100 || 0.6;
    cols = clamp(Math.round(W / (W < 520 ? 4.3 : 6.4)), 56, 120);
    cw = W / cols; ch = cw / aspect;
    rows = Math.floor(H / ch); oy = (H - rows * ch) / 2;

    // sample the photo at twice the grid resolution, then average down
    const sw = cols * 2, sh = rows * 2;
    const off = document.createElement("canvas"); off.width = sw; off.height = sh;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.drawImage(img, 0, (oy / H) * img.naturalHeight, img.naturalWidth, (rows * ch / H) * img.naturalHeight, 0, 0, sw, sh);
    const px = o.getImageData(0, 0, sw, sh).data;
    const L = new Float32Array(sw * sh);
    for (let i = 0; i < L.length; i++) L[i] = (0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2]) / 255;
    const blurred = boxBlur(boxBlur(L, sw, sh, 3), sw, sh, 3);
    const v = new Float32Array(sw * sh);
    for (let i = 0; i < v.length; i++) {
      v[i] = clamp(Math.pow(clamp((0.9 - L[i]) / 0.82, 0, 1), 1.35) + clamp((blurred[i] - L[i]) * 6, 0, 0.5), 0, 1);
    }

    glyph = new Uint8Array(cols * rows); delay = new Float32Array(cols * rows); count = 0;
    // each cell's own threshold, so characters leave and come back one by one rather than all at once
    dither = new Float32Array(cols * rows); for (let i = 0; i < dither.length; i++) dither[i] = Math.random();
    const fx = W * 0.4, fy = H * 0.3, far = Math.hypot(W, H) * 0.7;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = (2 * r) * sw + 2 * c;
      const t = (v[a] + v[a + 1] + v[a + sw] + v[a + sw + 1]) / 4;
      const g = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
      const i = r * cols + c;
      glyph[i] = g; if (g) count++;
      const d = Math.hypot(c * cw - fx, r * ch - fy) / far;
      delay[i] = 150 + d * 1200 + Math.random() * 450;
    }

    // the outline: cells just outside the person, drawn with a stroke that follows the edge's direction
    outline = new Uint8Array(cols * rows); outlineDelay = new Float32Array(cols * rows);
    if (maskImg.naturalWidth) {
      const mo = document.createElement("canvas"); mo.width = cols; mo.height = rows;
      const mc = mo.getContext("2d", { willReadFrequently: true });
      mc.drawImage(maskImg, 0, (oy / H) * maskImg.naturalHeight, maskImg.naturalWidth, (rows * ch / H) * maskImg.naturalHeight, 0, 0, cols, rows);
      const md = mc.getImageData(0, 0, cols, rows).data;
      const m = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : md[4 * (r * cols + c)] / 255);
      let sx = 0, sy = 0, n = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (m(c, r) > 0.5) { sx += c; sy += r; n++; }
      const mx = n ? sx / n : cols / 2, my = n ? sy / n : rows / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (m(c, r) > 0.5) continue;
        let near = false;
        for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (m(c + dc, r + dr) > 0.5) { near = true; break; }
        if (!near) continue;
        const gx = m(c + 1, r) - m(c - 1, r) + 0.5 * (m(c + 1, r - 1) - m(c - 1, r - 1) + m(c + 1, r + 1) - m(c - 1, r + 1));
        const gy = (m(c, r + 1) - m(c, r - 1)) * 0.6 + 0.3 * (m(c - 1, r + 1) - m(c - 1, r - 1) + m(c + 1, r + 1) - m(c + 1, r - 1));
        const ax = Math.abs(gx), ay = Math.abs(gy);
        const ch2 = ax > 2.2 * ay ? "|" : ay > 2.2 * ax ? "-" : gx * gy > 0 ? "/" : "\\";
        const i = r * cols + c;
        outline[i] = at(ch2);
        // traced clockwise from the top of the head
        const angle = (Math.atan2(c - mx, -(r - my) * 0.6) + 2 * Math.PI) % (2 * Math.PI);
        outlineDelay[i] = 1500 + (angle / (2 * Math.PI)) * 1100;
      }
    }

    // Big Ben's clock face, and a box of sky beside it for the digital clock
    reserved = new Uint8Array(cols * rows);
    const ccx = CLOCK.x * W, ccy = CLOCK.y * H, cr = CLOCK.r * W;
    clock = { x: ccx, y: ccy, r: cr };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.hypot(c * cw + cw / 2 - ccx, oy + r * ch + ch / 2 - ccy) < cr * 1.08) reserved[r * cols + c] = 1;
    }
    const right = Math.round(cols * 0.66) - 1, width = 32, top = 1;
    digital = { left: right - width + 1, top, right };
    for (let r = top; r < top + 8 && r < rows; r++) for (let c = digital.left; c <= right; c++) if (c >= 0) reserved[r * cols + c] = 2;

    // atlas: row 0 = the ramp with brightness baked in, row 1 = dim, row 2 = accent, row 3 = bright white
    const aw = Math.ceil(cw * dpr), ah = Math.ceil(ch * dpr);
    const chars = CHARS;
    atlas = document.createElement("canvas"); atlas.width = aw * chars.length; atlas.height = ah * 4;
    const a = atlas.getContext("2d");
    a.font = `${ch * 0.92 * dpr}px ${getComputedStyle(note).fontFamily}`;
    a.textAlign = "center"; a.textBaseline = "middle";
    for (let k = 0; k < chars.length; k++) {
      const x = k * aw + aw / 2, y = ah / 2 + ah * 0.04;
      a.fillStyle = `rgba(245,245,247,${k < RAMP.length ? 0.36 + 0.64 * (k / (RAMP.length - 1)) : 0.5})`;
      a.fillText(chars[k], x, y);
      a.fillStyle = "rgba(245,245,247,0.4)"; a.fillText(chars[k], x, y + ah);
      a.fillStyle = ACCENT; a.fillText(chars[k], x, y + 2 * ah);
      a.fillStyle = "rgba(245,245,247,0.95)"; a.fillText(chars[k], x, y + 3 * ah);
    }
    built = true;
    return true;
  }

  // a tap's spot: opens quickly, holds, then fades in place at full size (it never shrinks) while the
  // characters come back one by one
  const smooth = (p) => p * p * (3 - 2 * p);
  function spot(tp, now) {
    const t = now - tp.t0;
    if (reduceMotion) return t < HOLD + FADE ? { r: tp.max, s: 1 } : null;
    if (t > GROW + HOLD + FADE) return null;
    const r = tp.max * (t < GROW ? 0.35 + 0.65 * easeOut(t / GROW) : 1);
    const s = t < GROW ? smooth(t / GROW) : t < GROW + HOLD ? 1 : 1 - smooth((t - GROW - HOLD) / FADE);
    return { r, s };
  }

  function draw(now) {
    raf = 0;
    if (!built) return;
    const t = now - start, frame = Math.floor(now / 70);
    const spots = [];
    for (let k = taps.length - 1; k >= 0; k--) {
      const s = spot(taps[k], now);
      if (!s) taps.splice(k, 1); else if (s.r > 0.5) spots.push({ x: taps[k].x, y: taps[k].y, r: s.r, s: s.s });
    }
    if (lens) {
      // the lens keeps its size and fades in and out, so leaving the picture never snaps it shut
      lens.s += (lens.on - lens.s) * 0.1;
      if (!lens.on && lens.s < 0.01) lens = null; else spots.push({ x: lens.x, y: lens.y, r: lens.r, s: lens.s });
    }
    let scanRow = -10;
    if (scan) {
      const p = (now - scan.t0) / 900;
      if (p > 1) scan = null; else scanRow = Math.floor(p * (rows + 6)) - 3;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const aw = Math.ceil(cw * dpr), ah = Math.ceil(ch * dpr), nr = RAMP.length;
    const dw = cw * dpr, dh = ch * dpr;
    let animating = spots.length > 0 || scan !== null;
    for (let r = 0; r < rows; r++) {
      const y = oy + r * ch, cy = y + ch / 2;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // the clocks' areas keep their ordinary characters until the clocks arrive and clear them
        if (reserved[i] === 1 && t > A_START && Math.hypot(c * cw + cw / 2 - clock.x, cy - clock.y) < clockClear(t)) continue;
        if (reserved[i] === 2 && t > D_START) continue;
        let g = glyph[i], d = delay[i], row = 0, alpha = 1;
        if (outline[i]) { g = outline[i]; d = outlineDelay[i]; row = 2; }
        if (!g) continue;
        let k = g;
        const noise = () => nr + ((Math.imul(i, 2654435761) ^ Math.imul(frame, 40503)) >>> 0) % NOISE.length;
        if (t < d) {
          animating = true;
          if (t < d - 420) continue;
          row = outline[i] ? 2 : 1; k = noise();
        } else if (Math.abs(r - scanRow) <= 1 && ((i + frame) % 3 === 0)) {
          row = 1; k = noise();
        }
        if (spots.length) {
          // how much of the photo shows here: 1 in the middle of a spot, easing to 0 at its edge
          const cx = c * cw + cw / 2;
          let m = 0;
          for (const o of spots) {
            const e = 1 - Math.hypot(cx - o.x, cy - o.y) / o.r;
            if (e > 0) m = Math.max(m, o.s * (e > 0.45 ? 1 : e / 0.45));
          }
          if (m > 0.001) {
            // a cell leaves once the reveal passes its own threshold, with a short scrambled cross-fade
            alpha = clamp((0.14 + 0.84 * dither[i] - m) / 0.14, 0, 1);
            if (alpha <= 0.02) continue;
            if (alpha < 1) { const h = ((Math.imul(i, 2246822519) ^ frame) >>> 0) % 6; row = h === 0 ? 2 : 1; k = noise(); }
          }
        }
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.drawImage(atlas, k * aw, row * ah, aw, ah, c * cw * dpr, y * dpr, dw, dh);
        if (alpha < 1) ctx.globalAlpha = 1;
      }
    }
    if (drawClocks(t, now)) animating = true;
    // the real photo, through soft-edged spots
    if (spots.length) {
      mctx.globalCompositeOperation = "source-over";
      mctx.clearRect(0, 0, mask.width, mask.height);
      for (const o of spots) {
        const x = o.x * dpr, y = o.y * dpr, r = o.r * dpr;
        const gr = mctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(0,0,0,${o.s})`); gr.addColorStop(0.45, `rgba(0,0,0,${o.s})`); gr.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = gr; mctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      mctx.globalCompositeOperation = "source-in";
      mctx.drawImage(img, 0, 0, mask.width, mask.height);
      ctx.drawImage(mask, 0, 0);
    }
    if (animating && visible) raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf && visible && built) raf = requestAnimationFrame(draw); };

  function londonNow() {
    const parts = {};
    for (const p of new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour12: false, weekday: "short", day: "2-digit",
      month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date())) parts[p.type] = p.value;
    return { h: +parts.hour % 24, m: +parts.minute, s: +parts.second, date: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`.toUpperCase() };
  }
  const glyphAt = (k, row, x, y, w, h) => ctx.drawImage(atlas, k * Math.ceil(cw * dpr), row * Math.ceil(ch * dpr), Math.ceil(cw * dpr), Math.ceil(ch * dpr), x * dpr, y * dpr, w * dpr, h * dpr);

  // The clocks arrive after the portrait: Big Ben's face clears from the middle, its rim draws round
  // clockwise and the hands sweep from twelve to the time; the digital digits decode left to right.
  // When a digit changes it scrambles briefly, like a split-flap board. Returns true while animating.
  const A_START = 1500, D_START = 1700;
  const clockClear = (t) => clock.r * 1.08 * easeOut(clamp((t - A_START) / 320, 0, 1));
  const shownDigits = ["", "", "", ""], changedAt = [0, 0, 0, 0];
  function drawClocks(t, wall) {
    if (t < A_START) return true;
    const now = londonNow(), frame = Math.floor(wall / 60);
    const noiseK = (seed) => at(NOISE[((Math.imul(seed, 2654435761) ^ Math.imul(frame, 40503)) >>> 0) % NOISE.length]);
    let busy = t < D_START + 1400;

    // Big Ben's face, at twice the character density
    const { x: cx, y: cy, r } = clock, sw = cw / 2, sh = ch / 2;
    const ta = t - A_START;
    const rim = clamp((ta - 200) / 500, 0, 1);                      // how much of the rim is drawn
    const sweep = easeOut(clamp((ta - 500) / 800, 0, 1));            // hands: 0 = at twelve, 1 = at the time
    const handsAt = [((now.h % 12) + now.m / 60) / 12, (now.m + now.s / 60) / 60, now.s / 60];
    const hands = [
      { a: handsAt[0], len: 0.52, row: 3, w: 0.6 },
      { a: handsAt[1], len: 0.82, row: 3, w: 0.45 },
      { a: handsAt[2], len: 0.86, row: 2, w: 0.32 },
    ].map((h) => {
      const a = h.a * sweep * 2 * Math.PI;
      return { ...h, ex: cx + Math.sin(a) * r * h.len, ey: cy - Math.cos(a) * r * h.len };
    });
    const segDist = (px, py, h) => {
      const vx = h.ex - cx, vy = h.ey - cy, l2 = vx * vx + vy * vy || 1;
      const u = clamp(((px - cx) * vx + (py - cy) * vy) / l2, 0, 1);
      return Math.hypot(px - cx - u * vx, py - cy - u * vy);
    };
    const K = at(BLOCK);
    if (ta > 120) for (let y = cy - r * 1.05; y < cy + r * 1.05; y += sh) for (let x = cx - r * 1.05; x < cx + r * 1.05; x += sw) {
      const px = x + sw / 2, py = y + sh / 2, d = Math.hypot(px - cx, py - cy);
      if (d > r) continue;
      let row = -1;
      if (d > r * 0.86) {
        const angle = ((Math.atan2(px - cx, -(py - cy)) / (2 * Math.PI)) + 1) % 1;
        if (angle <= rim) row = 1;
      } else if (sweep > 0) {
        for (const h of hands) if (segDist(px, py, h) < sh * h.w) { row = h.row; break; }
      }
      if (d < sh * 0.6 && ta > 400) row = 2;
      if (row >= 0) glyphAt(K, row, x, y, sw, sh);
    }

    // the digital clock: big HH:MM, then the date and the seconds
    if (t < D_START) return true;
    const { left, top } = digital;
    const td = t - D_START;
    const hhmm = String(now.h).padStart(2, "0") + String(now.m).padStart(2, "0");
    for (let n = 0; n < 4; n++) if (shownDigits[n] !== hhmm[n]) { if (shownDigits[n]) changedAt[n] = wall; shownDigits[n] = hhmm[n]; }
    // each lit cell settles at its own moment: left to right, with a little randomness
    const cell = (k, row, c, r, seed) => {
      const settle = (c - left) * 14 + (((seed * 2654435761) >>> 0) % 220);
      if (reduceMotion || td > settle) return glyphAt(k, row, c * cw, oy + r * ch, cw, ch);
      if (td > settle - 300) glyphAt(noiseK(seed), 2, c * cw, oy + r * ch, cw, ch);
    };
    let col = left;
    const big = (n) => {
      const pattern = DIGITS[+hhmm[n]], flipping = !reduceMotion && wall - changedAt[n] < 380;
      if (flipping) busy = true;
      for (let r = 0; r < 5; r++) for (let p = 0; p < 3; p++) for (let q = 0; q < 2; q++) {
        const c = col + 2 * p + q, seed = r * 997 + c * 31 + n;
        if (flipping) { if ((seed + frame) % 3) glyphAt(noiseK(seed), (seed + frame) % 2 ? 2 : 1, c * cw, oy + (top + r) * ch, cw, ch); continue; }
        if (pattern[r][p] === "#") cell(K, 3, c, top + r, seed);
      }
      col += 6;
    };
    big(0); col += 1; big(1); col += 2;
    if ((reduceMotion || now.s % 2 === 0) && td > 500) { cell(K, 2, col, top + 1, 7); cell(K, 2, col, top + 3, 9); }
    col += 3; big(2); col += 1; big(3);
    const line = (text, r, row) => {
      const start = digital.right - text.length + 1;
      for (let j = 0; j < text.length; j++) if (text[j] !== " ") cell(at(text[j]), row, start + j, r, r * 131 + j);
    };
    line(now.date, top + 6, 3);
    line(`LONDON ${hhmm.slice(0, 2)}:${hhmm.slice(2)}:${String(now.s).padStart(2, "0")}`, top + 7, 1);
    return busy;
  }

  function point(e) {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  const tapSize = () => Math.max(W, H) * (coarse ? 0.19 : 0.24);
  // phones get a prompt over the portrait once the text has built; the first tap dismisses it
  const hint = $("#tap-hint");
  function hideHint() {
    if (!hint || hint.hidden) return;
    hint.classList.remove("on");
    setTimeout(() => { hint.hidden = true; }, 400);
  }
  function showHint() {
    if (!hint || !coarse || tapped) return;
    hint.hidden = false;
    requestAnimationFrame(() => hint.classList.add("on"));
  }
  function addSpot(p, max) {
    hideHint();
    taps.push({ x: p.x, y: p.y, t0: performance.now(), max });
    if (taps.length > 40) taps.shift();
    if (!tapped) {
      tapped = true;
      note.innerHTML = coarse
        ? `<b>${count.toLocaleString("en-GB")} characters</b>, redrawn from a photo in your browser.`
        : "That is the photo underneath. Each character stands for how dark a patch of it is.";
    }
    kick();
  }
  canvas.addEventListener("click", (e) => addSpot(point(e), tapSize()));
  // a finger dragged sideways paints a trail of smaller spots (vertical drags still scroll the page)
  let trail = null;
  canvas.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") trail = point(e); });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") {
      const p = point(e);
      if (!lens) lens = { ...p, r: Math.min(W, H) * 0.17, s: 0, on: 1 };
      lens.x = p.x; lens.y = p.y; lens.on = 1;
      kick();
      return;
    }
    if (!trail) return;
    const p = point(e);
    if (Math.hypot(p.x - trail.x, p.y - trail.y) > 14) { addSpot(p, tapSize() * 0.7); trail = p; }
  });
  for (const ev of ["pointerup", "pointercancel"]) canvas.addEventListener(ev, () => { trail = null; });
  canvas.addEventListener("pointerleave", () => { trail = null; if (lens) { lens.on = 0; kick(); } });

  // a glitch line every few seconds while it is on screen
  function scheduleScan() {
    setTimeout(() => {
      if (visible && !document.hidden && !reduceMotion) { scan = { t0: performance.now() }; kick(); }
      scheduleScan();
    }, 4500 + Math.random() * 4000);
  }

  async function init() {
    try { await img.decode(); } catch (e) { if (!img.complete || !img.naturalWidth) { fig.classList.add("failed"); return; } }
    await maskReady;
    if (!build()) { fig.classList.add("failed"); return; }
    fig.classList.add("live");
    start = reduceMotion ? -1e9 : performance.now();
    note.innerHTML = `<b>${count.toLocaleString("en-GB")} characters</b>, redrawn from a photo in your browser. ${coarse ? "Tap it." : "Point at it, or click."}`;
    kick();
    setTimeout(showHint, reduceMotion ? 200 : 1600);
    setInterval(() => { if (!document.hidden) kick(); }, 1000);   // the clocks tick
    scheduleScan();
    onVisible(canvas, (v) => { visible = v; if (v) kick(); });
    let lastW = W;
    addEventListener("resize", () => {
      if (canvas.clientWidth === lastW) return;   // phones fire resize when the address bar moves
      lastW = canvas.clientWidth; build(); kick();
    });
  }
  init().catch(() => fig.classList.add("failed"));
  return { tap: (x, y) => addSpot({ x, y }, tapSize()) };
})();

// ==================================================================== the city
// A random road graph: a jittered grid, made connected with a random spanning tree, then given extra
// streets, a few diagonals and three faster main roads. Cars wander. A tap places a pickup on the
// nearest junction and runs Dijkstra from it; the first car the search reaches, counting the part of
// the street it is still on, gets the ride. Travel times use 25 km/h on streets and 45 km/h on main roads.
const city = (() => {
  const canvas = $("#city-canvas"), readout = $("#city-readout");
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const ACCENT = "#2997ff", INK = "#f5f5f7";
  const SEARCH_MS = 950, FADE_MS = 1200, STREET_KMH = 25, MAIN_KMH = 45;

  let W = 0, H = 0, dpr = 1, spacing = 50, metresPerPx = 3;
  let nodes = [], adj = [], roads = null, cars = [], jobs = [], rides = 0;
  let visible = false, raf = 0, last = 0, lastUser = -1e9, nextAuto = 0;

  const edgeOf = (a, b) => adj[a].find((e) => e.to === b);

  function build() {
    W = canvas.clientWidth; H = canvas.clientHeight; dpr = DPR();
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    spacing = W < 600 ? 40 : 52; metresPerPx = 150 / spacing;
    const nx = Math.ceil(W / spacing) + 2, ny = Math.ceil(H / spacing) + 2;
    const mainRows = new Set([Math.floor(ny * 0.33), Math.floor(ny * 0.72)]), mainCols = new Set([Math.floor(nx * 0.55)]);
    const id = (i, j) => j * nx + i;
    nodes = []; adj = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const jx = mainCols.has(i) ? 0.06 : 0.3, jy = mainRows.has(j) ? 0.06 : 0.3;
      nodes.push({ x: (i - 0.5) * spacing + (Math.random() - 0.5) * jx * spacing, y: (j - 0.5) * spacing + (Math.random() - 0.5) * jy * spacing });
      adj.push([]);
    }
    const link = (a, b, main) => {
      if (edgeOf(a, b)) return;
      const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      const kmh = main ? MAIN_KMH : STREET_KMH;
      const seconds = (len * metresPerPx) / (kmh / 3.6);
      adj[a].push({ to: b, len, seconds, main }); adj[b].push({ to: a, len, seconds, main });
    };
    // random spanning tree (depth-first), so every junction is reachable
    const seen = new Uint8Array(nx * ny), stack = [id(0, 0)]; seen[stack[0]] = 1;
    while (stack.length) {
      const u = stack[stack.length - 1], i = u % nx, j = (u / nx) | 0;
      const next = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]
        .filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !seen[id(a, b)]);
      if (!next.length) { stack.pop(); continue; }
      const [a, b] = next[(Math.random() * next.length) | 0];
      link(u, id(a, b), false); seen[id(a, b)] = 1; stack.push(id(a, b));
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) { const m = mainRows.has(j); if (m || Math.random() < 0.55) link(id(i, j), id(i + 1, j), m); }
      if (j + 1 < ny) { const m = mainCols.has(i); if (m || Math.random() < 0.55) link(id(i, j), id(i, j + 1), m); }
      if (i + 1 < nx && j + 1 < ny && Math.random() < 0.07) link(id(i, j), id(i + 1, j + 1), false);
    }
    // main roads must be continuous: upgrade any tree edge that lies on one
    for (let u = 0; u < nodes.length; u++) for (const e of adj[u]) {
      const i = u % nx, j = (u / nx) | 0, i2 = e.to % nx, j2 = (e.to / nx) | 0;
      if ((j === j2 && mainRows.has(j)) || (i === i2 && mainCols.has(i))) {
        if (!e.main) { e.main = true; e.seconds = (e.len * metresPerPx) / (MAIN_KMH / 3.6); }
      }
    }

    roads = document.createElement("canvas"); roads.width = canvas.width; roads.height = canvas.height;
    const r = roads.getContext("2d");
    r.scale(dpr, dpr); r.lineCap = "round";
    for (const pass of [false, true]) {
      r.strokeStyle = pass ? "#48484c" : "#28282c"; r.lineWidth = pass ? 3 : 1.6;
      r.beginPath();
      for (let u = 0; u < nodes.length; u++) for (const e of adj[u]) {
        if (e.to < u || e.main !== pass) continue;
        r.moveTo(nodes[u].x, nodes[u].y); r.lineTo(nodes[e.to].x, nodes[e.to].y);
      }
      r.stroke();
    }

    const inside = nodes.map((n, k) => k).filter((k) => isInside(nodes[k], 10));
    cars = [];
    const n = W < 600 ? 7 : 10;
    for (let k = 0; k < n; k++) {
      const from = inside[(Math.random() * inside.length) | 0];
      const e = adj[from][(Math.random() * adj[from].length) | 0];
      cars.push({ from, to: e.to, p: Math.random(), path: [], state: "roam", job: null });
    }
    jobs = [];
  }
  const isInside = (n, m) => n.x > m && n.y > m && n.x < W - m && n.y < H - m;

  // Dijkstra from src with a binary heap. Returns distances in seconds, parents and the settle order.
  // If `cars` is given, it stops once no unsettled junction can beat the best car found so far.
  function dijkstra(src, withCars) {
    const n = nodes.length, dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n), order = [], heap = [[0, src]];
    dist[src] = 0;
    const byNext = new Map();
    if (withCars) for (const c of cars) if (c.state === "roam") (byNext.get(c.to) || byNext.set(c.to, []).get(c.to)).push(c);
    let best = null, bestCost = Infinity;
    const push = (item) => {
      heap.push(item); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    };
    const pop = () => {
      const top = heap[0], end = heap.pop();
      if (heap.length) {
        heap[0] = end; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (done[u]) continue;
      if (withCars && d >= bestCost) break;
      done[u] = 1; order.push(u);
      for (const c of byNext.get(u) || []) {
        const cost = d + (1 - c.p) * edgeOf(c.from, c.to).seconds;
        if (cost < bestCost) { bestCost = cost; best = c; }
      }
      for (const e of adj[u]) {
        const nd = d + e.seconds;
        if (nd < dist[e.to]) { dist[e.to] = nd; parent[e.to] = u; push([nd, e.to]); }
      }
    }
    return { dist, parent, order, best, bestCost };
  }

  const fmtTime = (s) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
  const fmtKm = (px) => `${((px * metresPerPx) / 1000).toFixed(1)} km`;
  const carPos = (c) => {
    const a = nodes[c.from], b = nodes[c.to];
    return { x: a.x + (b.x - a.x) * c.p, y: a.y + (b.y - a.y) * c.p };
  };

  function nearestNode(x, y) {
    let best = 0, bd = Infinity;
    nodes.forEach((n, k) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  }

  function dispatch(pickup, byUser) {
    const t0 = performance.now();
    const s = dijkstra(pickup, true);
    const ms = performance.now() - t0;
    const car = s.best;
    if (!car) {
      if (byUser) readout.innerHTML = "<b>Every car is busy.</b> Dijkstra searched the whole city and found none free. Try again when one drops off.";
      return;
    }
    const path = [];
    for (let n = car.to; n !== pickup; ) { n = s.parent[n]; path.push(n); }
    let roadPx = (1 - car.p) * edgeOf(car.from, car.to).len, prev = car.to;
    for (const n of path) { roadPx += edgeOf(prev, n).len; prev = n; }
    const pos = carPos(car), straightPx = Math.hypot(pos.x - nodes[pickup].x, pos.y - nodes[pickup].y);
    car.state = "pickup"; car.path = path;
    const job = { id: ++rides, pickup, dropoff: -1, car, t0: performance.now(), search: s, line: { from: pos }, byUser };
    car.job = job; jobs.push(job);
    if (byUser || performance.now() - lastUser > 8000) {
      const timing = ms < 1 ? "in under a millisecond" : `in ${ms.toFixed(1)} ms`;
      readout.innerHTML =
        `<b>Ride ${job.id}${byUser ? "" : " (automatic, tap the map for yours)"}</b>. Nearest car by road: <i>${fmtKm(roadPx)}, ${fmtTime(s.bestCost)}</i>.<br>` +
        `In a straight line it is ${fmtKm(straightPx)}, which would have guessed ${fmtTime((straightPx * metresPerPx) / (STREET_KMH / 3.6))}.<br>` +
        `Dijkstra settled ${s.order.length} of ${nodes.length} junctions ${timing}.`;
    }
  }

  function arrive(c) {
    // the car has just reached c.to; decide where it goes next
    const here = c.to;
    let next;
    if (c.path.length) next = c.path.shift();
    else if (c.state === "pickup") {
      const job = c.job, p = nodes[here], far = Math.min(W, H) * 0.45;
      const options = nodes.map((n, k) => k).filter((k) => isInside(nodes[k], 24) && Math.hypot(nodes[k].x - p.x, nodes[k].y - p.y) > far);
      job.dropoff = options.length ? options[(Math.random() * options.length) | 0] : here;
      const s = dijkstra(job.dropoff, false);
      for (let n = here; n !== job.dropoff && n !== -1; ) { n = s.parent[n]; if (n !== -1) c.path.push(n); }
      c.state = "ride"; job.pickedAt = performance.now();
      next = c.path.length ? c.path.shift() : null;
    } else if (c.state === "ride") {
      c.job.doneAt = performance.now(); c.state = "roam"; c.job = null;
    }
    if (next == null) {
      const options = adj[here].filter((e) => e.to !== c.from && isInside(nodes[e.to], -spacing * 0.3));
      const pool = options.length ? options : adj[here];
      next = pool[(Math.random() * pool.length) | 0].to;
    }
    c.from = here; c.to = next; c.p = 0;
  }

  function step(dt) {
    const base = spacing * 1.15;   // px per second on a street; main roads 1.8x
    for (const c of cars) {
      let move = dt * base;
      while (move > 0) {
        const e = edgeOf(c.from, c.to);
        const speed = e.main ? 1.8 : 1;
        const left = (1 - c.p) * e.len;
        if (move * speed < left) { c.p += (move * speed) / e.len; move = 0; }
        else { move -= left / speed; arrive(c); }
      }
    }
    const now = performance.now();
    jobs = jobs.filter((j) => !j.doneAt || now - j.doneAt < 600);
  }

  function draw(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (!reduceMotion) step(dt);
    if (visible && now > nextAuto && now - lastUser > 7000 && jobs.filter((j) => !j.doneAt).length < 2) {
      const inside = nodes.map((n, k) => k).filter((k) => isInside(nodes[k], 30));
      dispatch(inside[(Math.random() * inside.length) | 0], false);
      nextAuto = now + 3200;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(roads, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round";

    for (const j of jobs) {
      const e = now - j.t0, s = j.search;
      // the search spreading out from the pickup
      if (e < SEARCH_MS + FADE_MS) {
        const shown = reduceMotion ? s.order.length : Math.min(s.order.length, Math.ceil(s.order.length * easeOut(Math.min(1, e / SEARCH_MS))));
        const alpha = 0.7 * (1 - clamp((e - SEARCH_MS) / FADE_MS, 0, 1));
        ctx.strokeStyle = `rgba(41,151,255,${alpha * 0.6})`; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let k = 1; k < shown; k++) {
          const u = s.order[k], p = s.parent[u];
          if (p < 0) continue;
          ctx.moveTo(nodes[p].x, nodes[p].y); ctx.lineTo(nodes[u].x, nodes[u].y);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(41,151,255,${alpha})`;
        for (let k = 0; k < shown; k++) { const n = nodes[s.order[k]]; ctx.fillRect(n.x - 1.5, n.y - 1.5, 3, 3); }
        // the straight line, for comparison
        if (j.car.state === "pickup") {
          const p = nodes[j.pickup];
          ctx.setLineDash([3, 5]); ctx.strokeStyle = `rgba(245,245,247,${alpha * 0.55})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(j.line.from.x, j.line.from.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // the route still to drive
      const c = j.car;
      if (!j.doneAt && c.job === j) {
        const pos = carPos(c);
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(nodes[c.to].x, nodes[c.to].y);
        for (const n of c.path) ctx.lineTo(nodes[n].x, nodes[n].y);
        if (c.state === "pickup") { ctx.strokeStyle = ACCENT; ctx.lineWidth = 2.6; }
        else { ctx.strokeStyle = "rgba(245,245,247,0.45)"; ctx.lineWidth = 1.6; ctx.setLineDash([4, 5]); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      // pickup pin, then dropoff square
      if (c.state === "pickup" && c.job === j) {
        const p = nodes[j.pickup], pulse = reduceMotion ? 0 : (now / 1000) % 1;
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(245,245,247,${0.5 * (1 - pulse)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
      }
      if (j.dropoff >= 0 && !j.doneAt) {
        const d = nodes[j.dropoff];
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.strokeRect(d.x - 4.5, d.y - 4.5, 9, 9);
      }
    }

    for (const c of cars) {
      const p = carPos(c);
      ctx.fillStyle = c.state === "roam" ? "#8e8e93" : c.state === "pickup" ? ACCENT : INK;
      ctx.beginPath(); ctx.arc(p.x, p.y, c.state === "roam" ? 2.6 : 3.8, 0, Math.PI * 2); ctx.fill();
    }

    if (visible && !reduceMotion) raf = requestAnimationFrame(draw);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); } };

  canvas.addEventListener("click", (e) => {
    const b = canvas.getBoundingClientRect();
    lastUser = performance.now();
    dispatch(nearestNode(e.clientX - b.left, e.clientY - b.top), true);
    kick();
  });

  build();
  draw(performance.now());
  onVisible(canvas, (v) => { visible = v; if (v) { nextAuto = Math.min(nextAuto, performance.now() + 900); kick(); } });
  let lastW = W;
  addEventListener("resize", () => { if (canvas.clientWidth !== lastW) { lastW = canvas.clientWidth; build(); kick(); } });

  return {
    ride: () => {
      const inside = nodes.map((n, k) => k).filter((k) => isInside(nodes[k], 30));
      lastUser = performance.now();
      dispatch(inside[(Math.random() * inside.length) | 0], true); kick();
    },
  };
})();

// ==================================================================== 54×: two lanes at the real rates
// Each lane is one pod. Dots are emitted at a twentieth of the real rate so they can be seen;
// the counters below them add up at the real rate, for as long as the lanes are on screen.
(() => {
  const flow = $("#flow");
  if (!flow) return;
  const SLOW = 20, TRAVEL = 1.5;
  const lanes = [...flow.querySelectorAll(".lane")].map((el) => {
    const canvas = el.querySelector("canvas");
    return { canvas, ctx: canvas.getContext("2d"), rate: +canvas.dataset.rate, out: el.querySelector("output"), dots: [], owed: 0, served: 0 };
  });
  let visible = false, raf = 0, last = 0, colour = "#1d1d1f", colourAt = 0;

  function size() {
    for (const l of lanes) { l.dpr = DPR(); l.w = l.canvas.clientWidth; l.h = l.canvas.clientHeight; l.canvas.width = l.w * l.dpr; l.canvas.height = l.h * l.dpr; }
  }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (now - colourAt > 500) { colour = getComputedStyle(flow).color; colourAt = now; }
    for (const l of lanes) {
      l.served += l.rate * dt;
      l.out.textContent = Math.floor(l.served).toLocaleString("en-GB");
      const c = l.ctx;
      c.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
      c.clearRect(0, 0, l.w, l.h);
      c.fillStyle = colour;
      if (reduceMotion) {
        const n = Math.round((l.rate / SLOW) * TRAVEL);
        for (let k = 0; k < n; k++) c.fillRect(((k * 97.3) % 1) * l.w + (k / n) * l.w * 0.98, 6 + ((k * 7.7) % 1) * (l.h - 14), 3, 3);
        continue;
      }
      l.owed += (l.rate / SLOW) * dt;
      while (l.owed >= 1) { l.owed -= 1; l.dots.push({ t: now - Math.random() * dt * 1000, y: 6 + Math.random() * (l.h - 14) }); }
      l.dots = l.dots.filter((d) => now - d.t < TRAVEL * 1000);
      for (const d of l.dots) c.fillRect(((now - d.t) / (TRAVEL * 1000)) * l.w, d.y, 3, 3);
    }
    if (visible) raf = requestAnimationFrame(frame);
  }
  size();
  addEventListener("resize", size);
  onVisible(flow, (v) => { visible = v; if (v && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } });
})();

// ==================================================================== token bucket, 5 per 10 seconds
// Same behaviour as the limiter in github.com/sepehrvahedi/local-rate-limit: tokens return continuously,
// one every two seconds, up to five.
(() => {
  const MAX = 5, PER_SECOND = 5 / 10;
  const bucket = { tokens: MAX, at: performance.now() };
  const cells = [...document.querySelectorAll("#sim-bucket i")];
  const simLog = $("#sim-log"), simTokens = $("#sim-tokens"), sendBtn = $("#sim-send");
  if (!sendBtn) return;
  let started = null, served = 0, limited = 0;

  function refill(now) {
    bucket.tokens = Math.min(MAX, bucket.tokens + ((now - bucket.at) / 1000) * PER_SECOND);
    bucket.at = now;
  }
  function draw() {
    refill(performance.now());
    cells.forEach((cell, i) => cell.style.setProperty("--f", clamp(bucket.tokens - i, 0, 1).toFixed(3)));
    simTokens.textContent = `${Math.floor(bucket.tokens)} of ${MAX} tokens` + (limited ? ` · ${served} served, ${limited} limited` : "");
    if (bucket.tokens < MAX) requestAnimationFrame(draw);
  }
  function send() {
    const now = performance.now();
    refill(now);
    if (started === null) { started = now; simLog.textContent = ""; }
    const ok = bucket.tokens >= 1;
    const line = document.createElement("li");
    const stamp = `<time>+${((now - started) / 1000).toFixed(1)}s</time>`;
    if (ok) { bucket.tokens -= 1; served += 1; line.innerHTML = `${stamp}200 OK`; }
    else {
      limited += 1; line.className = "s429";
      line.innerHTML = `${stamp}429 Too Many Requests · retry in ${((1 - bucket.tokens) / PER_SECOND).toFixed(1)}s`;
      if (navigator.vibrate) navigator.vibrate(30);
    }
    simLog.append(line);
    while (simLog.children.length > 5) simLog.firstChild.remove();
    draw();
  }
  sendBtn.addEventListener("click", send);
  draw();
})();

// ==================================================================== Codeforces, fetched live
(() => {
  const fig = $("#cf"), svg = $("#cf-chart"), cap = $("#cf-cap");
  if (!fig || !window.fetch) return;
  const NS = "http://www.w3.org/2000/svg";
  let data = null, asked = false;
  const title = (r) => r >= 2400 ? "International Grandmaster" : r >= 2300 ? "International Master" : r >= 2100 ? "Master"
    : r >= 1900 ? "Candidate Master" : r >= 1600 ? "Expert" : r >= 1400 ? "Specialist" : r >= 1200 ? "Pupil" : "Newbie";

  function render(animate) {
    const w = svg.clientWidth || 600, h = svg.clientHeight || 180, padL = 0, padR = 44, padT = 14, padB = 10;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.textContent = "";
    const ratings = data.map((d) => d.newRating);
    const lo = Math.min(1500, ...ratings) - 50, hi = Math.max(2150, ...ratings) + 50;
    const x = (i) => padL + (i / Math.max(1, data.length - 1)) * (w - padL - padR);
    const y = (r) => padT + (1 - (r - lo) / (hi - lo)) * (h - padT - padB);
    const el = (name, attrs, text) => {
      const n = document.createElementNS(NS, name);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      if (text) n.textContent = text;
      svg.append(n); return n;
    };
    for (const [r, cls] of [[1600, "grid"], [1900, "cm"], [2100, "grid"]]) {
      el("line", { x1: 0, x2: w - padR + 8, y1: y(r), y2: y(r), class: cls });
      el("text", { x: w, y: y(r) + 4, "text-anchor": "end", "font-size": 11, fill: "currentColor", opacity: 0.55, "font-family": "ui-monospace, Menlo, monospace" }, r);
    }
    const line = el("polyline", { points: data.map((d, i) => `${x(i)},${y(d.newRating)}`).join(" "), class: "line" });
    data.forEach((d, i) => el("circle", { cx: x(i), cy: y(d.newRating), r: 3.2, style: "fill: var(--tint); stroke: var(--ink); stroke-width: 2" }));
    if (animate && !reduceMotion && line.getTotalLength) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        line.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.25, 0.1, 0.25, 1)"; line.style.strokeDashoffset = 0;
      }));
    }
  }

  async function load() {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch("https://codeforces.com/api/user.rating?handle=Bruuh.", { signal: ctrl.signal });
      const json = await res.json();
      if (json.status !== "OK" || !json.result.length) return;
      data = json.result;
      const best = Math.max(...data.map((d) => d.newRating));
      const lastDate = new Date(data[data.length - 1].ratingUpdateTimeSeconds * 1000)
        .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      fig.hidden = false;
      cap.innerHTML = `Fetched from the Codeforces API just now: max rating <b>${best}</b>, <b>${title(best)}</b>, ` +
        `${data.length} rated contests, the last on ${lastDate}. Dashed line: 1900, where Candidate Master starts.`;
      render(true);
      addEventListener("resize", () => render(false));
    } catch (e) { /* offline or blocked: the static line below the chart already says 2075 */ }
    finally { clearTimeout(timer); }
  }
  onVisible($("#teaching"), (v) => { if (v && !asked) { asked = true; load(); } }, "300px");
})();

// ==================================================================== command line
const cmd = $("#cmd"), input = $("#cmd-in"), out = $("#cmd-out");
const open = (url) => { window.location.href = url; };
const esc = (text) => String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const ids = sections.map((s) => s.id).filter(Boolean);
const COMMANDS = {
  help: ["this list", () => say(Object.entries(COMMANDS).map(([k, [text]]) => `<b>${k.padEnd(9)}</b> ${esc(text)}`).join("\n"), true)],
  goto: ["goto NAME: " + ids.join(", "), (arg) => {
    const el = arg && document.getElementById(ids.find((id) => id.startsWith(arg.toLowerCase())) || "");
    if (!el) return say("goto where? " + ids.join(", "), true);
    el.scrollIntoView({ block: "start" }); close();
  }],
  ride: ["call a car in the city", () => { close(); $("#city").scrollIntoView({ block: "start" }); if (city) setTimeout(city.ride, 400); }],
  reveal: ["show the photo under the portrait", () => {
    close(); window.scrollTo({ top: 0 });
    const c = $("#ascii canvas");
    if (portrait && c) setTimeout(() => portrait.tap(c.clientWidth / 2, c.clientHeight * 0.4), 300);
  }],
  cv: ["open the CV (pdf)", () => open("assets/CV_Sepehr_Vahedi.pdf")],
  txt: ["open the CV as plain text", () => open("cv.txt")],
  email: ["write to me", () => open("mailto:sepehr.vahedi@gmail.com")],
  github: ["github.com/sepehrvahedi", () => open("https://github.com/sepehrvahedi")],
  linkedin: ["LinkedIn profile", () => open("https://www.linkedin.com/in/sepehr-vahedi-8a8216216/")],
  theme: ["theme [light|dark]", (arg) => { setTheme(arg === "light" || arg === "dark" ? arg : currentTheme() === "dark" ? "light" : "dark"); close(); }],
  top: ["back to the top", () => { window.scrollTo({ top: 0 }); close(); }],
  source: ["read the source of this page", () => open("https://github.com/sepehrvahedi/sepehrvahedi.github.io")],
  print: ["print this page as a CV", () => { close(); window.print(); }],
  q: ["close this line", () => close()],
};
function say(html, keepOpen) { out.innerHTML = html; if (!keepOpen) setTimeout(close, 1600); }
function show() { cmd.hidden = false; out.textContent = ""; input.value = ""; input.focus(); }
function close() { cmd.hidden = true; input.blur(); }
const complete = (prefix) => Object.keys(COMMANDS).filter((k) => k.startsWith(prefix));
cmd.addEventListener("submit", (e) => {
  e.preventDefault();
  const [name, ...rest] = input.value.trim().replace(/^:/, "").split(/\s+/);
  if (!name) return close();
  const matches = COMMANDS[name] ? [name] : complete(name);
  if (matches.length !== 1) return say(matches.length ? "which one? " + matches.join(", ") : `not a command: ${esc(name)}. Try help.`, true);
  input.value = "";
  COMMANDS[matches[0]][1](rest.join(" "));
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); close(); }
  if (e.key === "Tab") {
    e.preventDefault();
    const matches = complete(input.value.trim());
    if (matches.length === 1) input.value = matches[0] + " ";
    else if (matches.length) say(matches.join("  "), true);
  }
});
$("#open-cmd").addEventListener("click", () => (cmd.hidden ? show() : close()));

// ------------------------------------------------------------------ keys
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)) return;
  const keys = {
    j: () => go(current + 1), k: () => go(current - 1),
    t: () => setTheme(currentTheme() === "dark" ? "light" : "dark"),
    ":": show, "/": show,
    "?": () => { show(); COMMANDS.help[1](); },
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

// ------------------------------------------------------------------ footer: what this page cost to load
addEventListener("load", () => setTimeout(() => {
  try {
    const here = [performance.getEntriesByType("navigation")[0], ...performance.getEntriesByType("resource")]
      .filter((r) => r && new URL(r.name, location.href).origin === location.origin);
    const bytes = here.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
    if (bytes > 0) $("#weight").textContent = `This visit: ${here.length} requests to this site, ${Math.round(bytes / 1024)} kB.`;
  } catch (e) { /* older browsers: say nothing */ }
}, 300));
