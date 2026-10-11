/**
 * Handwriting playback for typed characters.
 * Strokes come from public/pen-*.json (derived from the active font's glyph
 * skeletons by tools/pen_strokes.py): per glyph, an ordered list of polylines
 * in em units relative to the baseline. An invisible pen draws each stroke in
 * turn with a round nib; the real glyph is written when the pen finishes.
 */
import type { IMarker, Terminal } from "@xterm/xterm";

type Stroke = [number, number][];
let data: { w: number; asc: number; desc: number; body?: Record<string, number>; join?: Record<string, [P, P]>; glyphs: Record<string, Stroke[]> } | null = null;
let svg: SVGSVGElement | null = null;

const SPEED_EM_PER_S = 9;   // pen travel speed; ~120 ms for a typical lowercase
const MIN_MS = 60, MAX_MS = 220;
const LIFT_MS = 18;         // pause when the pen lifts between strokes
// debug: open with ?pen=slow to watch strokes at 1/20 speed
const SLOW = new URLSearchParams(location.search).get("pen") === "slow" ? 20 : 1;

/**
 * Cursive joining rules (school cursive: exit stroke of one letter → entry point of the next).
 * Each lowercase letter's entry and exit are fixed in the strokes file (tools/pen_strokes.py:
 * per-letter hints snapped onto the letter), and its strokes start at the entry. The join's
 * shape then depends on the two letters:
 *  - b o v w r end high, on the midline: into a letter entered near the midline they bridge
 *    across level; into one entered low the join dips to the baseline first ("tow-truck");
 *    g j p q y climb back from the descender.
 *  - Tall letters are entered at the top of the ascender: the join is an upstroke loop.
 *  - Round letters (a c d g o q) and s are entered at the top, approached over it from the left.
 *  - Otherwise a garland: a soft dip under the lower of the two ends.
 *  - The dot of i/j and the cross of t/f are written after the body, never joined.
 *  - No join into a capital, none between words, and digits don't join.
 * Points are em, y down from the baseline.
 */
type P = [number, number];
const ROUTE_LOW = "bovwrgjpqy";   // joins from these run down to the baseline first
function anchors(ch: string): { entry: P; exit: P; body: P[][]; marks: P[][] } | undefined {
  const strokes = data?.glyphs[ch];
  if (!strokes?.length) return;
  const n = data!.body?.[ch] ?? strokes.length, j = data!.join?.[ch];
  const body = strokes.slice(0, n), marks = strokes.slice(n);
  return { entry: j?.[0] ?? body[0][0], exit: j?.[1] ?? body[body.length - 1].at(-1)!, body, marks };
}

let wantUrl = "";
export async function loadPen(url: string) {
  wantUrl = url;
  data = null;
  const d = await (await fetch(url)).json();
  if (url === wantUrl) data = d;   // a slower, older load must not replace a newer font's strokes
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
 * A connecting stroke runs from where the last letter ended to where the next begins.
 * The joins stay on the page: each word's group is pinned to its buffer line with a marker,
 * follows it when the page scrolls, and a join goes when the letter it leads into is erased.
 * A word ends at a non-letter, a jump, or a pause.
 */
const WORD_GAP_MS = 1200;   // a longer pause between letters ends the word
const JOINS = /[A-Za-z]/;
// k0: viewport row the group was drawn at; ends: col → where that letter's last stroke ended (x, y − baseline)
type Joins = { g: SVGGElement; marker: IMarker; k0: number; ends: Map<number, [number, number, string]> };
let word: (Joins & { row: number; col: number; end: [number, number]; prev: string; until: number; timer?: number }) | null = null;
const kept: Joins[] = [];

function endWord() {
  if (!word) return;
  clearTimeout(word.timer);
  kept.push(word);
  word = null;
}

/** Keep the joins on their lines: follow scrolling, drop joins whose letters were erased. */
export function syncJoins(term: Terminal) {
  const buf = term.buffer.active;
  const h = (term as any)._core?._renderService?.dimensions?.css?.cell?.height;
  if (!h) return;
  for (const j of word ? [...kept, word] : [...kept]) {
    if (j.marker.isDisposed) { drop(j); continue; }
    j.g.style.display = buf.type === "alternate" ? "none" : "";
    j.g.setAttribute("transform", `translate(0 ${((j.marker.line - buf.viewportY) - j.k0) * h})`);
    const line = buf.getLine(j.marker.line), now = performance.now();
    for (const p of Array.from(j.g.children) as SVGElement[]) {
      if (now < Number(p.dataset.at)) continue;   // its letter is still being written
      // the letter this join leads into was erased or overwritten
      if ((line?.getCell(Number(p.dataset.col))?.getChars() ?? "") !== p.dataset.ch) p.remove();
    }
    if (!j.g.childElementCount && j !== word) drop(j);   // the word being written may not have a join yet
  }
}
function dropJoinsAt(line: number, col: number) {
  for (const j of word ? [...kept, word] : kept)
    if (!j.marker.isDisposed && j.marker.line === line) {
      j.g.querySelectorAll(`[data-col="${col}"]`).forEach((p) => p.remove());
      j.ends.delete(col);
    }
}
/** End of a letter already on the page just left of `col`, so a new letter can join on to it. */
function endBefore(term: Terminal, line: number, col: number, baseline: number): [number, number, string] | null {
  if (!JOINS.test(term.buffer.active.getLine(line)?.getCell(col - 1)?.getChars() ?? "")) return null;
  for (const j of kept) {
    const e = !j.marker.isDisposed && j.marker.line === line ? j.ends.get(col - 1) : undefined;
    if (e) return [e[0], baseline + e[1], e[2]];
  }
  return null;
}
function drop(j: Joins) {
  j.g.remove(); j.marker.dispose();
  const i = kept.indexOf(j); if (i >= 0) kept.splice(i, 1);
}
/** Font or size changed: the joins no longer fit the letters. */
export function clearJoins() {
  endWord();
  for (const j of [...kept]) drop(j);
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

/** The text's real step per column. WebKit lays out a row a hair narrower than xterm's fractional cell
 *  width, so col × cell.width drifts right (~1.5px by column 100). Measured once per cell width. */
let adv = { cell: 0, px: 0 };
function advance(term: Terminal, cell: number): number {
  if (adv.cell === cell) return adv.px;
  const rows = term.element?.querySelector<HTMLElement>(".xterm-rows");
  if (!rows) return cell;
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  const span = document.createElement("span");
  span.textContent = "m".repeat(200);
  probe.appendChild(span);
  rows.appendChild(probe);
  const w = span.getBoundingClientRect().width / 200;
  probe.remove();
  adv = { cell, px: w > 0 ? w : cell };
  return adv.px;
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
    const x0 = col * advance(term, dims.width);
    const toPx = (st: [number, number][]) => st.map(([x, y]) => [x0 + x * fs, baseline + y * fs]);
    const joins = cursive && JOINS.test(ch);
    const intoCapital = /[A-Z]/.test(ch);   // a capital starts with its own entry stroke
    if (!joins || intoCapital || !word || word.row !== buf.cursorY || word.col !== col || now + t > word.until) endWord();

    const lineAbs = buf.baseY + buf.cursorY;
    dropJoinsAt(lineAbs, col);   // retyping a cell: its old join goes
    let from: [number, number, string] | null = joins && word ? [...word.end, word.prev] : null;
    if (joins && !word) {
      from = intoCapital ? null : endBefore(term, lineAbs, col, baseline);   // e.g. retyping after a backspace
      const marker = term.registerMarker(0);
      if (marker) {
        word = { g: document.createElementNS("http://www.w3.org/2000/svg", "g"), marker, k0: lineAbs - buf.viewportY, ends: new Map(),
                 row: buf.cursorY, col, end: [x0, baseline], prev: ch, until: 0 };
        root.appendChild(word.g);
      }
    }
    if (joins && word && from) {
      // connector: from the last letter's exit to this letter's entry
      const [ex, ey, prev] = from;
      const [sx, sy] = toPx([anchors(ch)!.entry])[0];
      const gap = sx - ex, f = (n: number) => n.toFixed(2);
      const xh = -Math.min(...data.glyphs.x.flat().map((p) => p[1])) * fs;   // midline height, px
      let d: string;
      if (sy < baseline - 1.3 * xh) {
        // into a tall letter: an upstroke that swings right of the stem and hooks into its top
        d = `M${f(ex)} ${f(ey)}C${f(ex + gap * 0.55)} ${f(Math.max(ey, baseline - 0.1 * xh))} ${f(sx + 0.18 * fs)} ${f(sy + 0.45 * fs)} ${f(sx)} ${f(sy)}`;
      } else if ("bovwr".includes(prev) && Math.abs(sy - ey) < 0.5 * xh) {
        // high exit into a letter entered near the midline: a level bridge, barely sagging
        d = `M${f(ex)} ${f(ey)}C${f(ex + gap * 0.4)} ${f(ey + 0.05 * fs)} ${f(sx - gap * 0.4)} ${f(sy + 0.05 * fs)} ${f(sx)} ${f(sy)}`;
      } else if (ROUTE_LOW.includes(prev)) {
        // tow-truck / descender: run to the baseline between the letters, then rise into the entry
        const mx = ex + gap * 0.5;
        d = `M${f(ex)} ${f(ey)}C${f(ex + gap * 0.2)} ${f(ey)} ${f(mx - gap * 0.2)} ${f(baseline)} ${f(mx)} ${f(baseline)}`
          + `C${f(mx + gap * 0.2)} ${f(baseline)} ${f(sx - gap * 0.15)} ${f(sy)} ${f(sx)} ${f(sy)}`;
      } else if ("acdgoqs".includes(ch)) {
        // into a round letter: rise early and come over the top of the bowl from the left,
        // instead of cutting through its side
        d = `M${f(ex)} ${f(ey)}C${f(ex + gap * 0.25)} ${f(ey + 0.04 * fs)} ${f(sx - 0.45 * fs)} ${f(sy)} ${f(sx)} ${f(sy)}`;
      } else {
        // a garland: a soft dip just under the lower of the two ends
        const low = Math.max(ey, sy) + 0.08 * fs;
        d = `M${f(ex)} ${f(ey)}C${f(ex + gap * 0.35)} ${f(low)} ${f(sx - gap * 0.35)} ${f(low)} ${f(sx)} ${f(sy)}`;
      }
      const ms = Math.max(MIN_MS / 2, (Math.hypot(sx - ex, sy - ey) / fs / SPEED_EM_PER_S) * 1000) / hurry;
      strokePath(word.g, d, ink, nib * 0.8, ms, t);
      // the letter this join leads into, and when it lands on the page
      Object.assign((word.g.lastElementChild as SVGElement).dataset, { col: String(col), ch, at: String(now + t + 200) });
      t += ms;   // no lift: the pen flows straight into the letter
    }

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.appendChild(g);
    let last: Animation | null = null;
    let end: [number, number] = [x0, baseline];
    const a = anchors(ch);
    const order = cursive && a ? [...a.body, ...a.marks] : strokes;   // dots and crosses after the body
    for (const [k, st] of order.entries()) {
      const pts = toPx(st);
      const len = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
      const ms = Math.min(MAX_MS, Math.max(MIN_MS, (len / fs / SPEED_EM_PER_S) * 1000)) / hurry;
      last = strokePath(g, pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(""), ink, nib, ms, t);
      end = pts[pts.length - 1] as [number, number];
      t += ms + (k < order.length - 1 || !joins ? LIFT_MS / hurry : 0);
    }
    if (last) last.onfinish = () => g.remove(); else g.remove();

    if (joins && word) {
      end = toPx([anchors(ch)!.exit])[0] as [number, number];   // joins leave from the letter's exit
      word.col = col + 1; word.end = end; word.prev = ch; word.ends.set(col, [end[0], end[1] - baseline, ch]); word.until = now + t + WORD_GAP_MS;
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
