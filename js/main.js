// Everything on the page works without this file. It adds: the theme switch, keyboard navigation,
// a small command line (press ":"), the token bucket in figure 3, and the page weight in the colophon.
"use strict";

const $ = (s) => document.querySelector(s);
const sections = [...document.querySelectorAll("main section")];

// ------------------------------------------------------------------ theme
const root = document.documentElement;
const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const currentTheme = () => root.dataset.theme || (systemDark() ? "dark" : "light");
function setTheme(theme) {
  root.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch (e) { /* private mode */ }
  $("#theme").textContent = theme === "dark" ? "light" : "dark";     // the button names where it takes you
}
$("#theme").textContent = currentTheme() === "dark" ? "light" : "dark";
$("#theme").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

// ------------------------------------------------------------------ where am I: mark the current section in the contents
const tocLinks = new Map([...document.querySelectorAll(".toc li a")].map((a) => [a.getAttribute("href").slice(1), a]));
let current = 0;
const spy = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    current = sections.indexOf(e.target);
    for (const [id, a] of tocLinks) a.toggleAttribute("aria-current", id === e.target.id);
  }
}, { rootMargin: "-20% 0px -70% 0px" }) : null;
if (spy) sections.forEach((s) => spy.observe(s));

function go(index) {
  current = Math.max(0, Math.min(sections.length - 1, index));
  sections[current].scrollIntoView({ block: "start" });
  history.replaceState(null, "", "#" + sections[current].id);
}

// ------------------------------------------------------------------ command line
const cmd = $("#cmd"), input = $("#cmd-in"), out = $("#cmd-out");
const open = (url) => { window.location.href = url; };
const esc = (text) => String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const COMMANDS = {
  help: ["this list", () => say(Object.entries(COMMANDS).map(([k, [text]]) => `<b>${k.padEnd(9)}</b> ${esc(text)}`).join("\n"), true)],
  goto: ["goto NAME: abstract, results, experience, research, open-source, also, contact", (arg) => {
    const i = sections.findIndex((s) => s.id.startsWith((arg || "").toLowerCase()));
    if (!arg || i < 0) return say("goto where? " + sections.map((s) => s.id).join(", "), true);
    go(i); close();
  }],
  cv: ["open the CV (pdf)", () => open("assets/CV_Sepehr_Vahedi.pdf")],
  "ml-cv": ["open the ML-platform CV (pdf)", () => open("assets/CV_Sepehr_Vahedi_ML.pdf")],
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
function say(text, keepOpen) {
  out.innerHTML = text;
  if (!keepOpen) setTimeout(close, 1600);
}
function show() {
  cmd.hidden = false; out.textContent = ""; input.value = ""; input.focus();
}
function close() {
  cmd.hidden = true; input.blur();
}
function complete(prefix) {
  return Object.keys(COMMANDS).filter((k) => k.startsWith(prefix));
}
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
let lastG = 0;
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const keys = {
    j: () => go(current + 1), k: () => go(current - 1),
    G: () => go(sections.length - 1),
    g: () => { if (Date.now() - lastG < 500) { window.scrollTo({ top: 0 }); current = 0; } lastG = Date.now(); },
    t: () => setTheme(currentTheme() === "dark" ? "light" : "dark"),
    ":": show, "/": show,
    "?": () => { show(); COMMANDS.help[1](); },
  };
  if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
});

// ------------------------------------------------------------------ figure 3: a token bucket, 5 per 10 seconds
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
  if (started === null) { started = now; simLog.textContent = ""; simLog.classList.add("live"); }
  const ok = bucket.tokens >= 1;
  const line = document.createElement("li");
  const stamp = `<time>+${((now - started) / 1000).toFixed(1).padStart(5)}s</time>`;
  if (ok) {
    bucket.tokens -= 1; served += 1;
    line.innerHTML = `${stamp} 200 OK`;
  } else {
    limited += 1;
    line.className = "s429";
    line.innerHTML = `${stamp} 429 Too Many Requests · retry in ${((1 - bucket.tokens) / PER_SECOND).toFixed(1)}s`;
  }
  simLog.append(line);
  while (simLog.children.length > 5) simLog.firstChild.remove();
  draw();
}
if ($("#sim-send")) { $("#sim-send").addEventListener("click", send); draw(); }

// ------------------------------------------------------------------ colophon: what this page actually cost to load
addEventListener("load", () => setTimeout(() => {
  try {
    const here = [performance.getEntriesByType("navigation")[0], ...performance.getEntriesByType("resource")]
      .filter((r) => r && new URL(r.name, location.href).origin === location.origin);
    const bytes = here.reduce((sum, r) => sum + (r.transferSize || r.encodedBodySize || 0), 0);
    if (bytes > 0) $("#weight").textContent = `This visit: ${here.length} requests to this site, ${Math.round(bytes / 1024)} kB.`;
  } catch (e) { /* older browsers: say nothing */ }
}, 300));
