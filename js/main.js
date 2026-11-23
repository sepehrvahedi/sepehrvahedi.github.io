// Everything on the page works without this file. It adds: the charts drawing in, the theme switch,
// a small command line (press ":"), keyboard navigation, the token-bucket demo and the page weight in the footer.
"use strict";

const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll("main section")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ charts draw their bars once, when first seen
const charts = [...document.querySelectorAll(".chart")];
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("drawn");
      io.unobserve(e.target);
    }
  }, { threshold: 0.3 });
  charts.forEach((el) => io.observe(el));
} else {
  charts.forEach((el) => el.classList.add("drawn"));
}

// ------------------------------------------------------------------ theme
const root = document.documentElement;
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const currentTheme = () => root.dataset.theme || (systemDark() ? "dark" : "light");
function setTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }
}
$("#theme").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

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
  current = Math.max(0, Math.min(sections.length - 1, index));
  sections[current].scrollIntoView({ block: "start" });
}

// ------------------------------------------------------------------ command line
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

// ------------------------------------------------------------------ token bucket, 5 per 10 seconds
// Same behaviour as the limiter in github.com/sepehrvahedi/local-rate-limit: tokens return continuously,
// one every two seconds, up to five.
const MAX = 5, PER_SECOND = 5 / 10;
const bucket = { tokens: MAX, at: performance.now() };
const cells = [...document.querySelectorAll("#sim-bucket i")];
const simLog = $("#sim-log"), simTokens = $("#sim-tokens");
let started = null, served = 0, limited = 0;

function refill(now) {
  bucket.tokens = Math.min(MAX, bucket.tokens + ((now - bucket.at) / 1000) * PER_SECOND);
  bucket.at = now;
}
function draw() {
  refill(performance.now());
  cells.forEach((cell, i) => cell.style.setProperty("--f", Math.max(0, Math.min(1, bucket.tokens - i)).toFixed(3)));
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
  }
  simLog.append(line);
  while (simLog.children.length > 5) simLog.firstChild.remove();
  draw();
}
if ($("#sim-send")) { $("#sim-send").addEventListener("click", send); draw(); }

// ------------------------------------------------------------------ footer: what this page cost to load
addEventListener("load", () => setTimeout(() => {
  try {
    const here = [performance.getEntriesByType("navigation")[0], ...performance.getEntriesByType("resource")]
      .filter((r) => r && new URL(r.name, location.href).origin === location.origin);
    const bytes = here.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
    if (bytes > 0) $("#weight").textContent = `This visit: ${here.length} requests to this site, ${Math.round(bytes / 1024)} kB.`;
  } catch (e) { /* older browsers: say nothing */ }
}, 300));
