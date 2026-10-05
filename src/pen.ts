/**
 * Pen-stroke reveal for typed characters.
 * Each echoed glyph is held briefly while its outline (from the Radon TTF) is
 * drawn on an SVG overlay at the cursor: a left-to-right wipe of the ink fill
 * plus a pen-tip trace along the outline. Then the real glyph is written.
 */
import type { Terminal } from "@xterm/xterm";
import { parse, type Font } from "opentype.js";

const STROKE_MS = 90;   // per character
const STAGGER_MS = 40;  // extra per additional character in the same chunk

let font: Font | null = null;
let svg: SVGSVGElement | null = null;

export async function loadPenFont(url: string) {
  font = parse(await (await fetch(url)).arrayBuffer());
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
 * Animate `text` (1–4 printable ASCII chars) at the cursor.
 * Returns how long to hold the real write, in ms (0 = nothing animated).
 */
export function penWrite(term: Terminal, text: string, ink: string): number {
  if (!font) return 0;
  const dims = (term as any)._core?._renderService?.dimensions?.css?.cell;
  const root = overlay(term);
  if (!dims?.width || !root) return 0;

  const fs = term.options.fontSize ?? 15;
  const upm = font.unitsPerEm;
  const asc = (font.ascender / upm) * fs;
  const desc = (font.descender / upm) * fs;          // negative
  const buf = term.buffer.active;
  const rowTop = buf.cursorY * dims.height;
  const baseline = rowTop + (dims.height - (asc - desc)) / 2 + asc;

  let total = 0;
  [...text].forEach((ch, i) => {
    const x = (buf.cursorX + i) * dims.width;
    const d = font!.getPath(ch, x, baseline, fs).toPathData(2);
    if (!d) return;
    const delay = i * STAGGER_MS;
    total = Math.max(total, delay + STROKE_MS);
    drawGlyph(root, d, x, rowTop, dims.width, dims.height, ink, delay);
  });
  return total;
}

function drawGlyph(root: SVGSVGElement, d: string, x: number, y: number, w: number, h: number, ink: string, delay: number) {
  const ns = "http://www.w3.org/2000/svg";
  const id = `clip${Math.random().toString(36).slice(2)}`;
  const g = document.createElementNS(ns, "g");
  g.innerHTML = `
    <clipPath id="${id}"><rect x="${x}" y="${y}" width="0" height="${h}"/></clipPath>
    <path d="${d}" fill="${ink}" clip-path="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${ink}" stroke-width="0.9" stroke-linejoin="round" pathLength="1"
          stroke-dasharray="1" stroke-dashoffset="1"/>`;
  root.appendChild(g);
  const [rect, , trace] = [g.querySelector("rect")!, 0, g.querySelectorAll("path")[1]];
  const opts = { duration: STROKE_MS, delay, easing: "ease-out", fill: "forwards" as const };
  rect.animate([{ width: "0" }, { width: `${w}px` }], opts);
  trace.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], opts).onfinish = () => g.remove();
}
