/**
 * Line numbers in the gutter, left of the margin line: every row, or one per command (at each prompt).
 * Lives inside .xterm-screen so it shares the baseline shift and row geometry.
 */
import type { IMarker, Terminal } from "@xterm/xterm";
import { prefs } from "./prefs";

export class LineNumbers {
  private el: HTMLDivElement | null = null;
  private prompts: { marker: IMarker; n: number }[] = [];
  private count = 0;

  constructor(private term: Terminal) {
    term.onRender(() => this.draw());
    term.onScroll(() => this.draw());
  }

  /** OSC 133;A: a prompt starts at the cursor row. */
  prompt() {
    const line = this.term.buffer.active.baseY + this.term.buffer.active.cursorY;
    const last = this.prompts[this.prompts.length - 1];
    if (last && !last.marker.isDisposed && last.marker.line === line) return;   // redraw of the same prompt
    const marker = this.term.registerMarker(0);
    if (marker) this.prompts.push({ marker, n: ++this.count });
  }

  draw() {
    const screen = this.term.element?.querySelector<HTMLElement>(".xterm-screen");
    const cell = (this.term as any)._core?._renderService?.dimensions?.css?.cell;
    if (!screen || !cell?.height) return;
    if (!this.el || this.el.parentElement !== screen) {
      this.el = document.createElement("div");
      this.el.id = "linenos";
      screen.appendChild(this.el);
    }
    const buf = this.term.buffer.active;
    const labels: string[] = new Array(this.term.rows).fill("");
    if (prefs.lineNumbers === "rows" && buf.type === "normal") {
      const last = buf.baseY + buf.cursorY;           // number only rows that have been written
      for (let i = 0; i < this.term.rows; i++) {
        const line = buf.viewportY + i;
        if (line <= last) labels[i] = String(line + 1);
      }
    } else if (prefs.lineNumbers === "commands" && buf.type === "normal") {
      this.prompts = this.prompts.filter((p) => !p.marker.isDisposed);
      for (const p of this.prompts) {
        const i = p.marker.line - buf.viewportY;
        if (i >= 0 && i < this.term.rows) labels[i] = String(p.n);
      }
    }
    this.el.style.setProperty("--row", `${cell.height}px`);
    const html = labels.map((l) => `<span>${l}</span>`).join("");
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
  }
}
