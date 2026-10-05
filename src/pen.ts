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

/** Write `text` (1–4 printable ASCII chars) by hand at the cursor. Returns the hold in ms. */
export function penWrite(term: Terminal, text: string, ink: string, backlog = 0): number {
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
  for (const [i, ch] of [...text].entries()) {
    const strokes = data.glyphs[ch];
    if (!strokes) continue;
    const x0 = (buf.cursorX + i) * dims.width;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    root.appendChild(g);
    let last: Animation | null = null;
    for (const st of strokes) {
      const pts = st.map(([x, y]) => [x0 + x * fs, baseline + y * fs]);
      const len = pts.reduce((a, p, k) => (k ? a + Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) : 0), 0);
      const ms = Math.min(MAX_MS, Math.max(MIN_MS, (len / fs / SPEED_EM_PER_S) * 1000)) / hurry;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(""));
      path.setAttribute("stroke", ink);
      path.setAttribute("stroke-width", (data.w * fs).toFixed(2));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("fill", "none");
      path.setAttribute("pathLength", "1");
      path.setAttribute("stroke-dasharray", "1");
      path.setAttribute("stroke-dashoffset", "1");
      g.appendChild(path);
      last = path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: ms, delay: t, easing: "cubic-bezier(.3,.1,.6,1)", fill: "forwards" });
      t += ms + LIFT_MS / hurry;
    }
    if (last) last.onfinish = () => g.remove(); else g.remove();
  }
  return Math.round(t);
}

/** hhea ascender/descender of the active font (from its TTF, via the strokes file), in px. */
function fontMetrics(fs: number) {
  return { asc: data!.asc * fs, desc: data!.desc * fs };
}
