"use strict";

/* ---------------- theme ---------------- */
const root = document.documentElement;
document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("theme", next); } catch (e) { /* private mode */ }
});

/* ---------------- mobile menu ---------------- */
const menuBtn = document.getElementById("menu-toggle");
const navLinks = document.getElementById("nav-links");
menuBtn.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});
navLinks.addEventListener("click", (e) => {
  if (e.target.tagName === "A") { navLinks.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
});

/* ---------------- active section + reveal ---------------- */
const sections = [...document.querySelectorAll("main section[id]")];
const linkFor = (id) => navLinks.querySelector(`a[href="#${id}"]`);
if ("IntersectionObserver" in window) {
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        navLinks.querySelectorAll("a").forEach((a) => a.classList.remove("active"));
        const a = linkFor(en.target.id);
        if (a) a.classList.add("active");
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => spy.observe(s));

  const rev = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); rev.unobserve(en.target); } });
  }, { threshold: 0.08 });
  document.querySelectorAll(".commit, .card, .code, .edu-row").forEach((el) => { el.classList.add("reveal"); rev.observe(el); });
}

/* ---------------- terminal ---------------- */
const out = document.getElementById("term-output");
const form = document.getElementById("term-form");
const input = document.getElementById("term-input");
const body = document.getElementById("term-body");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CV = "assets/CV_Sepehr_Vahedi.pdf";
const COMMANDS = {
  help: () => [
    "<span class='t-hl'>available commands</span>",
    "  <span class='t-key'>whoami</span>      who is this",
    "  <span class='t-key'>about</span>       the short version",
    "  <span class='t-key'>experience</span>  git log of my career",
    "  <span class='t-key'>projects</span>    things I built",
    "  <span class='t-key'>research</span>    LLM + testing research",
    "  <span class='t-key'>skills</span>      the stack",
    "  <span class='t-key'>cv</span>          open my CV (pdf)",
    "  <span class='t-key'>contact</span>     how to reach me",
    "  <span class='t-key'>theme</span>       toggle light / dark",
    "  <span class='t-key'>clear</span>       clear the screen",
  ].join("\n"),
  whoami: () => "Sepehr Vahedi, software engineer in London.\nBackend · distributed systems · ML infrastructure.",
  about: () => "3.5 years full-time at Tapsi (10M+ monthly active users), promoted to Senior in Jan 2024.\nMSc Software Systems Engineering @ UCL, graduating Sep 2027.\nCodeforces Candidate Master (max 2075).",
  experience: () => [
    "<span class='t-hl'>a3f9c21</span> Senior SWE, Delivery and Marketplace @ Tapsi  <span class='t-dim'>(2025-12..2026-09)</span>",
    "        54x model-server throughput · ETA MAPE 24% → 19% · owned delivery-routing",
    "<span class='t-hl'>7be2d04</span> Senior SWE @ Tapsi                          <span class='t-dim'>(2024-01..2024-12)</span>",
    "        event-sourced Kafka backend, deliveries doubled · −45% infra cost rewrite",
    "<span class='t-hl'>1c08e5a</span> Software Engineer @ Tapsi                   <span class='t-dim'>(2022-02..2023-12)</span>",
    "        −67% GPS-service load · school-transport platform for 12,000+ students",
    "<span class='t-hl'>0e41b7f</span> Co-Founder @ RabinCash                      <span class='t-dim'>(2020-02..2021-02)</span>",
    "<span class='t-dim'>→ full details: <a href='#experience'>#experience</a></span>",
  ].join("\n"),
  projects: () => [
    "drwxr-xr-x  <a href='https://github.com/sepehrvahedi/testgen-council' target='_blank' rel='noopener'>testgen-council/</a>        multi-agent LLM test generation",
    "drwxr-xr-x  <a href='https://github.com/sepehrvahedi/local-rate-limit' target='_blank' rel='noopener'>local-rate-limit/</a>       Envoy + Istio per-user rate limiting",
    "drwxr-xr-x  <a href='https://github.com/sepehrvahedi/automatic-paper-critique' target='_blank' rel='noopener'>automatic-paper-critique/</a> 4 LLMs + Borda count",
    "drwxr-xr-x  <a href='https://github.com/sepehrvahedi/VenueBooker' target='_blank' rel='noopener'>VenueBooker/</a>            Kotlin · Spring Boot · Kafka",
    "drwxr-xr-x  <a href='https://github.com/sepehrvahedi/Compiler-C-Minus' target='_blank' rel='noopener'>Compiler-C-Minus/</a>       compiler for a C subset",
  ].join("\n"),
  research: () => "TestCouncil: 84.6% line / 92.5% branch coverage, 36+ pts over the best single model.\nIssue titles: −37.3% LLM input tokens, within 0.004 BERTScore of GPT-4.",
  skills: () => "kotlin java python go c++ typescript sql\nspring-boot reactor grpc kafka · triton kserve onnx pytorch\nkubernetes docker helm argocd istio envoy prometheus grafana",
  cv: () => { window.open(CV, "_blank", "noopener"); return `opening <a href='${CV}' target='_blank' rel='noopener'>${CV}</a> …`; },
  contact: () => "email     <a href='mailto:sepehr.vahedi@gmail.com'>sepehr.vahedi@gmail.com</a>\nlinkedin  <a href='https://www.linkedin.com/in/sepehr-vahedi-8a8216216/' target='_blank' rel='noopener'>/in/sepehr-vahedi-8a8216216</a>\ngithub    <a href='https://github.com/sepehrvahedi' target='_blank' rel='noopener'>github.com/sepehrvahedi</a>",
  theme: () => { document.getElementById("theme-toggle").click(); return `theme → ${root.getAttribute("data-theme")}`; },
  ls: () => "about.md  experience.log  projects/  research/  stack.kt  cv.pdf",
  "cat cv.pdf": () => COMMANDS.cv(),
  "sudo hire-me": () => "[sudo] password for recruiter: ********\n<span class='t-hl'>access granted.</span> Available from September 2027 · <a href='mailto:sepehr.vahedi@gmail.com'>say hello</a>",
  "rm -rf /": () => "<span class='t-err'>nice try.</span> This system has on-call coverage.",
  exit: () => "There is no escape. Try <span class='t-key'>contact</span> instead.",
  pwd: () => "/home/sepehr/london",
  date: () => new Date().toString(),
};
const ALIASES = { h: "help", "?": "help", resume: "cv", "cv.pdf": "cv", stack: "skills", work: "experience", ll: "ls", "ls -la": "ls", email: "contact" };

const history = [];
let hIndex = 0;

function print(cmd, html, cls = "t-out") {
  if (cmd !== null) {
    const line = document.createElement("div");
    line.innerHTML = `<span class="t-ps1">sepehr@london:~$</span> <span class="t-cmd">${esc(cmd)}</span>`;
    out.appendChild(line);
  }
  if (html) {
    const res = document.createElement("div");
    res.className = cls;
    res.innerHTML = html;
    out.appendChild(res);
  }
  body.scrollTop = body.scrollHeight;
}

function run(raw) {
  const cmd = raw.trim().replace(/\s+/g, " ");
  if (!cmd) return print("", "");
  history.push(cmd); hIndex = history.length;
  const key = ALIASES[cmd.toLowerCase()] || cmd.toLowerCase();
  if (key === "clear") { out.innerHTML = ""; return; }
  const fn = COMMANDS[key];
  if (fn) print(cmd, fn());
  else print(cmd, `command not found: ${esc(cmd.split(" ")[0])}. Type <span class='t-key'>help</span>.`, "t-out t-err");
}

form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value); input.value = ""; });
input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && history.length) { hIndex = Math.max(0, hIndex - 1); input.value = history[hIndex]; e.preventDefault(); }
  else if (e.key === "ArrowDown" && history.length) { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ""; e.preventDefault(); }
  else if (e.key === "Tab") {
    e.preventDefault();
    const v = input.value.toLowerCase();
    const hit = Object.keys(COMMANDS).find((c) => v && c.startsWith(v));
    if (hit) input.value = hit;
  } else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); out.innerHTML = ""; }
});
body.addEventListener("click", () => { if (!window.getSelection().toString()) input.focus({ preventScroll: true }); });

/* boot sequence: type a few commands, then hand over to the visitor */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BOOT = ["whoami", "cat now.txt", "help"];
const BOOT_OUT = {
  "cat now.txt": "MSc Software Systems Engineering @ UCL · open to SWE roles from Sep 2027\nprevious: 3.5 years @ Tapsi · 54x throughput · ETA error 24% → 19%",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function typeCommand(cmd) {
  const line = document.createElement("div");
  line.innerHTML = `<span class="t-ps1">sepehr@london:~$</span> <span class="t-cmd"></span>`;
  out.appendChild(line);
  const span = line.querySelector(".t-cmd");
  for (const ch of cmd) { span.textContent += ch; await sleep(reduceMotion ? 0 : 45 + Math.random() * 40); }
  await sleep(reduceMotion ? 0 : 220);
  const html = BOOT_OUT[cmd] || COMMANDS[cmd]();
  print(null, html);
}

(async function boot() {
  input.disabled = true;
  for (const c of BOOT) { await typeCommand(c); await sleep(reduceMotion ? 0 : 350); }
  input.disabled = false;
  if (window.matchMedia("(pointer: fine)").matches && window.scrollY < 40) input.focus({ preventScroll: true });
})();
