import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke, Channel } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";
import { mark, reportPerf } from "./perf";
import { loadPen, penWrite, syncJoins, clearJoins } from "./pen";
import { openSettings, type Changed } from "./settings";
import { prefs, savePrefs } from "./prefs";
import { highlightOutput, resetOutputState, InputHighlighter } from "./highlight";
import { LineNumbers } from "./linenumbers";
import { drawGlyphs } from "./glyphs";
import { overlayScrollbar } from "./scrollbar";

const USE_WEBGL = false;

// font choice: settings card (Cmd/Ctrl+,) or Cmd/Ctrl+Shift+F to cycle; ?font=<key> overrides
const FONTS = [
  { key: "radon", family: "Monaspace Radon", label: "Monaspace Radon", pen: "/pen-strokes.json" },
  { key: "victor-cursive", family: "Victor Mono Cursive", label: "Victor Mono · cursive", pen: "/pen-victor-cursive.json" },
  { key: "victor", family: "Victor Mono", label: "Victor Mono", pen: "/pen-victor.json" },
  { key: "maple", family: "Maple Mono", label: "Maple Mono", pen: "/pen-maple.json" },
  { key: "maple-cursive", family: "Maple Mono Cursive", label: "Maple Mono · cursive", pen: "/pen-maple-cursive.json" },
];
const DEFAULT_SIZE = 17;
const wanted = new URLSearchParams(location.search).get("font") ?? prefs.font;
let font = FONTS.find((f) => f.key === wanted) ?? FONTS[0];

/**
 * Load every weight/style of the font up front. A face that loads on first use leaves its
 * text invisible until it arrives, so a TUI repainting bold/italic text flashes meanwhile.
 */
function loadFaces() {
  const all = Promise.all(["", "bold ", "italic ", "italic bold "].map((v) =>
    document.fonts.load(`${v}15px "${font.family}"`).catch(() => [])));
  // never block on it: WebKit can leave the promise for a style the family lacks (the
  // cursive families have no italic face) pending, which used to stall font switching
  return Promise.race([all, new Promise((r) => setTimeout(r, 800))]);
}

function fontStack() { return `"${font.family}", monospace`; }

/** xterm colors from the ink theme; ink is palette blue, graphite the default foreground. */
function xtermTheme() {
  const { ink, graphite } = prefs.colors;
  return {
    background: "rgba(0,0,0,0)",
    foreground: graphite,
    cursor: ink,
    selectionBackground: "#c8e2f5",
    selectionInactiveBackground: "#dde9f3",
    // ink palette for a light page: every color dark enough to read on paper
    black: graphite,        brightBlack: "#5a5e6a",
    red: "#b3261e",         brightRed: "#c62828",
    green: "#2e7d32",       brightGreen: "#1b7f3b",
    yellow: "#8a6d00",      brightYellow: "#946f00",
    blue: ink,              brightBlue: ink,
    magenta: "#7b3f8c",     brightMagenta: "#8e3f9e",
    cyan: "#0e6e7c",        brightCyan: "#0f7f90",
    white: "#6b6f7b",       brightWhite: "#3a3d47",
  };
}

const term = new Terminal({
  fontFamily: fontStack(),
  fontSize: prefs.fontSize,
  lineHeight: 1.6,
  allowTransparency: true,
  allowProposedApi: true,   // decorations: typed-command highlighting
  cursorBlink: true,
  cursorStyle: "underline",
  cursorInactiveStyle: "underline",   // unfocused: same underscore, not an outline box
  scrollback: 5000,
  theme: xtermTheme(),
});

const fit = new FitAddon();
term.loadAddon(fit);
const el = document.getElementById("term")!;
const lines = new LineNumbers(term);
drawGlyphs(term, document.getElementById("sheet")!);
const scrollbar = overlayScrollbar(el);
const inputHl = new InputHighlighter(term);
// shell marks stay in the stream so these fire at the exact row they belong to
term.parser.registerOscHandler(133, (data) => {
  if (data[0] === "A") lines.prompt();
  else if (data[0] === "B") inputHl.begin();
  else if (data[0] === "C") inputHl.end();
  return true;
});
term.onWriteParsed(() => inputHl.update());
term.onRender(() => syncJoins(term));   // cursive joins stay pinned to their lines

async function main() {
  mark("prefs");
  await Promise.all([
    loadFaces().then(() => mark("fonts")),
    loadPen(font.pen).catch((e) => console.warn("pen strokes", e)).then(() => mark("pen")),
  ]);
  term.open(el);
  mark("termOpen");
  scrollbar.refresh();
  applyColors();
  // DOM renderer on purpose: glyphs are real text, so the ink-on-paper
  // shadows are plain CSS. WebKit drops CSS filters on the WebGL canvas layer.
  if (USE_WEBGL) {
    try { term.loadAddon(new WebglAddon()); } catch (e) { console.warn("WebGL unavailable", e); }
  }
  fit.fit();
  applyRuling();
  mark("fitted");
  term.onData(noteTyping);   // cursor hides while keys are being typed

  if (!("__TAURI_INTERNALS__" in window)) return demoMode();   // plain browser: UI dev only

  const onData = new Channel<Uint8Array>();
  const dec = new TextDecoder();
  onData.onmessage = (bytes) => {
    mark("firstOutput");
    if (quietReady) settleReady();
    enqueue(inkify(dec.decode(new Uint8Array(bytes), { stream: true })));
  };
  mark("spawnCall");
  const integrated = await invoke<boolean>("spawn", { cols: term.cols, rows: term.rows, onData });
  mark("spawned");
  setTimeout(() => (ready = true), 10_000);   // hard cap: a shell that never sends the mark must still take input

  // Input is dropped (not queued) until the shell has drawn its first prompt (OSC 133;A). A shell
  // without the integration never sends one: treat it as ready once its output goes quiet.
  if (!integrated) { quietReady = true; settleReady(); }
  const enc = new TextEncoder();
  term.onData((s) => { if (ready) invoke("write", { data: Array.from(enc.encode(s)) }); });
  term.onResize(({ cols, rows }) => invoke("resize", { cols, rows }));

  new ResizeObserver(() => { fit.fit(); applyRuling(); }).observe(el);
  term.attachCustomKeyEventHandler(zoomKeys);
  term.focus();
  watchTrafficLights();
}

/** macOS window buttons: hidden until the pointer is over the top strip. */
function watchTrafficLights() {
  let shown = true;
  // appear when the pointer is in the corner where the buttons live
  // (top-left on macOS), within 9% of the window's width and height
  const ZONE = 0.09;
  const set = (v: boolean) => {
    if (v === shown) return;
    shown = v;
    invoke("traffic_lights", { visible: v, duration: v ? 0.25 : 0.45 });
  };
  const inZone = (e: MouseEvent) => e.clientX <= innerWidth * ZONE && e.clientY <= innerHeight * ZONE;
  document.addEventListener("mousemove", (e) => set(inZone(e)));
  document.addEventListener("mouseleave", () => set(false));
  invoke("traffic_lights", { visible: false, duration: 0 }); shown = false;
}

/** Hide the cursor while typing; it returns after a short pause. */
let idleTimer: number | undefined;
function noteTyping() {
  el.classList.add("typing");
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => el.classList.remove("typing"), 700);
}

/** No PTY in a plain browser: fake a prompt and local echo so the paper UI can be developed. */
function demoMode() {
  const prompt = () => enqueue(inkify("\x1b]133;A\x07demo ~ % \x1b]133;B\x07"));
  prompt();
  (window as any).__tp = { term, enqueue, inkify, setFont, state: () => ({ typing, ready, pending }) };
  // debug: ?settings=open opens the panel on load (headless screenshots of the page turn)
  if (new URLSearchParams(location.search).get("settings") === "open") openSettings(FONTS, settingsChanged, () => term.focus());
  let typed = 0;   // like a shell's line editor: backspace stops at the prompt
  term.onData((s) => {
    if (s === "\r") { typed = 0; enqueue(inkify("\x1b]133;C\x07\r\n(demo: no shell)\r\n")); prompt(); }
    else if (s === "\x7f") { if (typed > 0) { typed--; enqueue("\b \b"); } }
    else if (!s.startsWith("\x1b")) { typed += [...s].length; enqueue(s); }
  });
  new ResizeObserver(() => { fit.fit(); applyRuling(); }).observe(el);
  term.attachCustomKeyEventHandler(zoomKeys);
  term.focus();
}

/** Cmd/Ctrl +/-/0 font size, Cmd/Ctrl+, settings, Cmd/Ctrl+Shift+F cycles fonts; everything else passes to xterm. */
function zoomKeys(e: KeyboardEvent): boolean {
  if (e.type !== "keydown" || !(e.metaKey || e.ctrlKey)) return true;
  if (e.shiftKey && e.code === "KeyF") { setFont(FONTS[(FONTS.indexOf(font) + 1) % FONTS.length].key); return false; }
  if (e.key === ",") { openSettings(FONTS, settingsChanged, () => term.focus()); return false; }
  const step = e.key === "=" || e.key === "+" ? 1 : e.key === "-" ? -1 : e.key === "0" ? 0 : null;
  if (step === null) return true;
  setSize(step === 0 ? DEFAULT_SIZE : term.options.fontSize! + step);
  return false;
}

function settingsChanged(what: Changed) {
  if (what === "font") setFont(prefs.font);
  else if (what === "fontSize") setSize(prefs.fontSize);
  else if (what === "highlight") inputHl.update();
  else if (what === "colors") { term.options.theme = xtermTheme(); applyColors(); inputHl.update(); }
  lines.draw();
}

function applyColors() {
  document.documentElement.style.setProperty("--lineno", prefs.colors.lineNumber);
}

function setSize(size: number) {
  clearJoins();
  term.options.fontSize = prefs.fontSize = Math.min(32, Math.max(9, size));
  savePrefs();
  fit.fit(); applyRuling();
}

async function setFont(key: string) {
  font = FONTS.find((f) => f.key === key) ?? font;
  prefs.font = font.key; savePrefs();
  const want = font;
  await Promise.all([loadFaces(), loadPen(font.pen).catch((e) => console.warn("pen strokes", e))]);
  if (font !== want) return;   // a newer pick arrived while this one loaded
  clearJoins();
  term.options.fontFamily = fontStack();
  fit.fit(); applyRuling();
}

/**
 * Turn OSC 133 shell-integration marks into ink colors:
 * A (prompt start) -> graphite, B (command input) -> blue ink, C (output start) -> graphite.
 * A sequence may be split across chunks, so hold back a trailing partial ESC.
 */
const INK_SGR = "\x1b[34m";   // palette blue = theme ink, so a theme change recolors typed text too
const RESET_SGR = "\x1b[39m";
let carry = "";
let ready = false;
let quietReady = false;   // no prompt marks to wait for: ready after output settles
let quietTimer: number | undefined;
function settleReady() { clearTimeout(quietTimer); quietTimer = window.setTimeout(() => (ready = true), 1000); }
let typing = false;   // between the B (input start) and C (output start) marks
let phase: "prompt" | "input" | "output" = "output";

/** Writes stay in order; a typed-character echo is held while its pen stroke plays. */
let queue: Promise<void> = Promise.resolve();
let pending = 0;   // writes waiting in the queue
let lastFast: Promise<void> = Promise.resolve();   // settles when xterm has parsed the latest fast-path write
function enqueue(s: string) {
  if (!s) return;
  const pen = typing && /^[\x21-\x7e]{1,4}$/.test(s);
  // xterm keeps writes in order itself; only a pen stroke has to wait (for the cursor to settle)
  const write = () => { lastFast = new Promise((r) => term.write(s, r)); };
  if (!pen && pending === 0) return write();
  pending++;
  queue = queue.then(async () => {
    if (pen) {
      await lastFast;   // xterm has parsed everything before this, so the cursor is current
      let hold = 0;
      try { hold = penWrite(term, s, prefs.colors.ink, pending - 1, font.key.endsWith("cursive")); } catch (e) { console.error("pen", e); }
      if (hold) await new Promise((r) => setTimeout(r, hold));
    }
    write();
    pending--;
  });
}
function inkify(chunk: string): string {
  let s = carry + chunk;
  carry = "";
  const tail = s.lastIndexOf("\x1b");
  if (tail !== -1 && isPartialEscape(s.slice(tail))) {
    carry = s.slice(tail); s = s.slice(0, tail);
  }
  // odd parts are the marks; even parts are text in the current phase
  return s.split(/(\x1b\]133;[ABCD](?:;[^\x07\x1b]*)?(?:\x07|\x1b\\))/).map((part, i) => {
    if (i % 2) {
      const m = part[6];
      if (m === "A") { ready = true; mark("prompt"); reportPerf(); }
      typing = m === "B";
      if (m !== "D") phase = m === "A" ? "prompt" : m === "B" ? "input" : "output";
      if (m === "C") resetOutputState();
      return part + (m === "B" ? INK_SGR : m === "A" || m === "C" ? RESET_SGR : "");
    }
    const t = part.replace(/\x1b\[([0-9;]*)m/g, remapSgr);
    return phase === "output" && prefs.hlOutput ? highlightOutput(t, term) : t;
  }).join("");
}

/** True only for an escape sequence that is genuinely cut off at the chunk end. */
function isPartialEscape(t: string): boolean {
  if (t.length === 1) return true;                                  // lone ESC
  if (t[1] === "]") return !/[\x07\x9c]|\x1b\\/.test(t) && t.length < 64;  // OSC without terminator
  if (t[1] === "[") return !/[\x40-\x7e]/.test(t.slice(2));         // CSI without final byte
  return false;                                                     // anything else: pass through
}

/**
 * Rewrite SGR sequences for a light page:
 *  - 7/27 (inverse): the canvas background is transparent, so inverse would
 *    paint letters transparent and the cell in ink. Use a highlighter instead.
 *  - 38;5;n and 38;2;r;g;b foregrounds: apps pick these for dark terminals;
 *    clamp their luminance so pale yellows/cyans stay legible on paper.
 */
const HIGHLIGHT_BG = "48;2;200;226;245";
const MAX_FG_LUMA = 0.42;
function remapSgr(seq: string, params: string): string {
  if (!/(^|;)(7|27|38|40|48)(;|$)/.test(params)) return seq;
  const p = params.split(";");
  const out: string[] = [];
  for (let i = 0; i < p.length; i++) {
    const n = p[i];
    if (n === "38" && p[i + 1] === "2" && i + 4 < p.length) {
      out.push("38", "2", ...inkClamp(+p[i + 2], +p[i + 3], +p[i + 4]).map(String)); i += 4;
    } else if (n === "38" && p[i + 1] === "5" && i + 2 < p.length) {
      const rgb = xterm256(+p[i + 2]);
      if (rgb) out.push("38", "2", ...inkClamp(...rgb).map(String)); else out.push("38", "5", p[i + 2]);
      i += 2;
    } else if (n === "48" && isDarkBg(p, i)) {
      out.push("49"); i += p[i + 1] === "2" ? 4 : 2;      // a dark-terminal panel: leave the paper bare
    } else if (n === "40") out.push("49");
    else if ((n === "48" || n === "58") && (p[i + 1] === "2" || p[i + 1] === "5")) {
      const len = p[i + 1] === "2" ? 5 : 3;      // keep background/underline runs intact
      out.push(...p.slice(i, i + len)); i += len - 1;
    } else if (n === "7") out.push(HIGHLIGHT_BG);
    else if (n === "27") out.push("49");
    else out.push(n);
  }
  return `\x1b[${out.join(";")}m`;
}

/** 48;2;r;g;b or 48;5;n darker than mid-grey: painted for a dark terminal, invisible intent on paper. */
function isDarkBg(p: string[], i: number): boolean {
  const rgb = p[i + 1] === "2" ? [+p[i + 2], +p[i + 3], +p[i + 4]] : p[i + 1] === "5" ? (+p[i + 2] === 0 ? [0, 0, 0] : xterm256(+p[i + 2])) : null;
  return !!rgb && (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.25;
}

/** Darken an RGB foreground until its luminance is at most MAX_FG_LUMA. */
function inkClamp(r: number, g: number, b: number): [number, number, number] {
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luma <= MAX_FG_LUMA) return [r, g, b];
  const k = MAX_FG_LUMA / luma;
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
}

/** RGB for xterm 256-color indices 16..255; null for 0..15 (theme handles those). */
function xterm256(n: number): [number, number, number] | null {
  if (n < 16 || n > 255 || Number.isNaN(n)) return null;
  if (n >= 232) { const v = 8 + (n - 232) * 10; return [v, v, v]; }
  const c = n - 16, lv = [0, 95, 135, 175, 215, 255];
  return [lv[Math.floor(c / 36)], lv[Math.floor(c / 6) % 6], lv[c % 6]];
}

/** Lock the paper ruling to xterm's actual cell height. */
function applyRuling() {
  // semi-private; isolated here so it is a one-line fix if xterm moves it
  const dims = (term as any)._core?._renderService?.dimensions?.css?.cell;
  if (!dims?.height) return;
  const sheet = document.getElementById("sheet")!;
  // whole pixels only: a half-pixel offset anti-aliases the 1px rules to grey
  const cell = Math.round(dims.height);
  // 1.5 rows of space above the text; the header strip hides the top rule,
  // so the first visible rule is the one under the single empty line.
  sheet.style.paddingTop = `${Math.round(cell * 1.5)}px`;
  sheet.style.setProperty("--cover", `${cell}px`);
  const top = Math.round(el.getBoundingClientRect().top - sheet.getBoundingClientRect().top);
  sheet.style.setProperty("--rule", `${cell}px`);
  // baseline rests just above the rule: 1/3 em, tuned as 5px at 15px type
  sheet.style.setProperty("--baseline-shift", `${Math.round((term.options.fontSize ?? 15) / 3)}px`);
  sheet.style.setProperty("--rule-offset", `${top + cell - 1}px`);
}

main();
