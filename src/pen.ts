/**
 * Handwriting playback for typed characters.
 * Strokes come from public/pen-*.json (derived from the active font's glyph
 * skeletons by tools/pen_strokes.py): per glyph, an ordered list of polylines
 * in em units relative to the baseline. An invisible pen draws each stroke in
 * turn with a round nib; the real glyph is written when the pen finishes.
 */
import type { Terminal } from "@xterm/xterm";

type Stroke = [number, number][];
let data: { w: number; asc: number; desc: number; glyphs: Record<string, Stroke[]> } | null = null;
let svg: SVGSVGElement | null = null;

const SPEED_EM_PER_S = 9;   // pen travel speed; ~120 ms for a typical lowercase
const MIN_MS = 60, MAX_MS = 220;
const LIFT_MS = 18;         // pause when the pen lifts between strokes
// debug: open with ?pen=slow to watch strokes at 1/20 speed
const SLOW = new URLSearchParams(location.search).get("pen") === "slow" ? 20 : 1;

export async function loadPen(url: string) {
  data = null;
  data = await (await fetch(url)).json();
}

function overlay(term: Terminal): SVGSVGElement | null {
  const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
  if (!screen) return null;
  if (!svg || svg.parentElement !== screen) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "pen";
    screen.appendChild(svg);
  }
  svg.setAttribute("width", String(screen.clientWidth));
  svg.setAttribute("height", String(screen.clientHeight));
  return svg;
}

/**
 * Cursive: letters typed in a run are joined like a word written without lifting the pen.
 * A connecting stroke runs from where the last letter ended to where the next begins;
 * the connectors stay until the word ends (a non-letter, a jump, or a pause), then fade.
 */
const WORD_GAP_MS = 1200;   // a longer pause between letters ends the word
const JOINS = /[A-Za-z0-9']/;
let word: { g: SVGGElement; row: number; col: number; end: [number, number]; until: number; timer?: number } | null = null;

function endWord() {
  if (!word) return;
  const g = word.g;
  clearTimeout(word.timer);
  word = null;
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = () => g.remove();
}

function strokePath(root: SVGGElement, d: string, ink: string, width: number, ms: number, delay: number): Animation {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("stroke", ink);
  path.setAttribute("stroke-width", width.toFixed(2));
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("fill", "none");
  path.setAttribute("pathLength", "1");
  path.setAttribute("stroke-dasharray", "1");
  path.setAttribute("stroke-dashoffset", "1");
  root.appendChild(path);
  return path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
    { duration: ms, delay, easing: "cubic-bezier(.3,.1,.6,1)", fill: "forwards" });
}

/** Write `text` (1–4 printable ASCII chars) by hand at the cursor. Returns the hold in ms. */
export function penWrite(term: Terminal, text: string, ink: string, backlog = 0, cursive = false): number {
  if (!data) return 0;
  const dims = (term as any)._core?._renderService?.dimensions?.css?.cell;
  const root = overlay(term);
  if (!dims?.width || !root) return 0;

  const fs = term.options.fontSize ?? 15;
  const buf = term.buffer.active;
  const rowTop = buf.cursorY * dims.height;
  // baseline: DOM renderer centers the font's content box in the cell
  const metrics = fontMetrics(fs);
  const baseline = rowTop + (dims.height - (metrics.asc - metrics.desc)) / 2 + metrics.asc;
  // write faster when keystrokes are piling up
  const hurry = (1 + Math.min(3, backlog * 0.5)) / SLOW;

  let t = 0;
  const now = performance.now();
  const nib = data.w * fs;
  for (const [i, ch] of [...text].entries()) {
    const strokes = data.glyphs[ch];
    if (!strokes) { endWord(); continue; }
    const col = buf.cursorX + i;
    const x0 = col * dims.width;
    const toPx = (st: [number, number][]) => st.map(([x, y]) => [x0 + x * fs, baseline + y * fs]);
    const joins = cursive && JOINS.test(ch);
    if (!joins || !word || word.row !== buf.cursorY || word.col !== col || now + t > word.until) endWord();

    if (joins && word) {
      // connector: leave the last letter low and forward, arrive at this letter's first stroke
      const [ex, ey] = word.end;
      const [sx, sy] = toPx(strokes[0])[0];
      const d = `M${ex.toFixed(2)} ${ey.toFixed(2)}C${(ex + dims.width * 0.3).toFixed(2)} ${(baseline + 0.02 * fs).toFixed(2)} ${(sx - dims.width * 0.15).toFixed(2)} ${(sy + 0.15 * fs).toFixed(2)} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      const ms = Math.max(MIN_MS / 2, (Math.hypot(sx - ex, sy - ey) / fs / SPEED_EM_PER_S) * 1000) / hurry;
      strokePath(word.g, d, ink, nib * 0.8, ms, t);
      t += ms;   // no lift: the pen flows straight into the letter
    }

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.appendChild(g);
    let last: Animation | null = null;
    let end: [number, number] = [x0, baseline];
    for (const [k, st] of strokes.entries()) {
      const pts = toPx(st);
      const len = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
      const ms = Math.min(MAX_MS, Math.max(MIN_MS, (len / fs / SPEED_EM_PER_S) * 1000)) / hurry;
      last = strokePath(g, pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(""), ink, nib, ms, t);
      end = pts[pts.length - 1] as [number, number];
      t += ms + (k < strokes.length - 1 || !joins ? LIFT_MS / hurry : 0);
    }
    if (last) last.onfinish = () => g.remove(); else g.remove();

    if (joins) {
      if (!word) { word = { g: document.createElementNS("http://www.w3.org/2000/svg", "g"), row: buf.cursorY, col, end, until: 0 }; root.appendChild(word.g); }
      word.col = col + 1; word.end = end; word.until = now + t + WORD_GAP_MS;
      clearTimeout(word.timer);
      word.timer = window.setTimeout(endWord, t + WORD_GAP_MS);
    }
  }
  return Math.round(t);
}

/** hhea ascender/descender of the active font (from its TTF, via the strokes file), in px. */
function fontMetrics(fs: number) {
  return { asc: data!.asc * fs, desc: data!.desc * fs };
}
