/**
 * Syntax highlighting in theme colors.
 *  - Output: plain text runs get SGR colors injected in the stream (programs that
 *    color their own output, and full-screen apps, are left alone).
 *  - Typed commands: xterm decorations recolor the cells, so the shell's echo stays
 *    plain and the pen keeps working.
 */
import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";
import { prefs, rgb, type Role } from "./prefs";

const fg = (role: Role) => `\x1b[38;2;${rgb(prefs.colors[role]).join(";")}m`;

const OUTPUT_TOKENS: [Role, RegExp][] = [
  ["path", /https?:\/\/[^\s"'<>]+/],
  ["path", /(?:~|\.{1,2})?\/[\w.@+\-][\w.@+\-\/]*/],
  ["string", /"[^"\n]*"|(?<!\w)'[^'\n]*'(?!\w)/],
  ["error", /\b(?:[Ee]rrors?|ERROR|[Ff]atal|FATAL|[Ff]ailed|FAILED|[Ff]ailure|FAIL|[Dd]enied|[Pp]anic|[Ee]xception)\b/],
  ["warning", /\b(?:[Ww]arn(?:ing)?s?|WARN(?:ING)?|[Dd]eprecated)\b/],
  ["success", /\b(?:ok|OK|[Ss]uccess(?:ful)?|[Ss]ucceeded|[Pp]assed|PASS(?:ED)?|[Dd]one)\b/],
  ["number", /\b\d+(?:\.\d+)*(?:[kKMGT]i?B?|%|ms|s)?\b/],
];
const OUTPUT_RE = new RegExp(OUTPUT_TOKENS.map(([, r]) => `(${r.source})`).join("|"), "g");

/** Is a program-set foreground color in effect? Then its text is left alone. */
let colored = false;

/** Color plain output text. `s` is a chunk already free of partial escapes. */
export function highlightOutput(s: string, term: Terminal): string {
  const alt = term.buffer.active.type === "alternate";
  return s.replace(/(\x1b(?:\[[0-9;?]*[\x40-\x7e]|\][^\x07\x1b]*(?:\x07|\x1b\\)|.))|([^\x1b]+)/gs, (m, esc, text) => {
    if (esc) {
      const sgr = /^\x1b\[([0-9;]*)m$/.exec(esc);
      if (sgr) {
        const p = sgr[1].split(";");
        if (sgr[1] === "" || p.includes("0") || p.includes("39")) colored = false;
        if (p.some((n) => /^(3[0-8]|9[0-7])$/.test(n))) colored = true;
      }
      return m;
    }
    if (alt || colored) return text;
    return text.replace(OUTPUT_RE, (tok: string, ...groups: string[]) => {
      const i = groups.findIndex((g, k) => k < OUTPUT_TOKENS.length && g !== undefined);
      return i < 0 ? tok : fg(OUTPUT_TOKENS[i][0]) + tok + "\x1b[39m";
    });
  });
}
export function resetOutputState() { colored = false; }

/** Shell command line → [start, end, role] spans. */
export function shellTokens(line: string): [number, number, Role][] {
  const out: [number, number, Role][] = [];
  const re = /("(?:\\.|[^"\\])*"?|'[^']*'?)|(\$\{?\w+\}?)|(\|\||&&|[|;&<>]+)|(\s+)|([^\s|;&<>"'$]+)/g;
  let expectCmd = true;
  for (let m; (m = re.exec(line)); ) {
    const [tok, str, vari, op, ws, word] = m;
    const at = m.index, end = at + tok.length;
    if (ws) continue;
    if (str) out.push([at, end, "string"]);
    else if (vari) out.push([at, end, "variable"]);
    else if (op) { out.push([at, end, "operator"]); expectCmd = /[|;&]/.test(op); continue; }
    else if (word) {
      if (expectCmd && !/=/.test(word)) out.push([at, end, "command"]);
      else if (/^-/.test(word)) out.push([at, end, "flag"]);
      else if (/^\d+(\.\d+)?$/.test(word)) out.push([at, end, "number"]);
      else if (/[\/~]|^\./.test(word)) out.push([at, end, "path"]);
      if (expectCmd && /=/.test(word)) continue;   // VAR=x cmd: the command is still to come
    }
    expectCmd = false;
  }
  return out;
}

/** Live decorations over the command being typed. */
export class InputHighlighter {
  private start: { marker: IMarker; x: number } | null = null;
  private decos: IDecoration[] = [];
  constructor(private term: Terminal) {}

  /** OSC 133;B: input starts at the cursor. */
  begin() {
    this.start = { marker: this.term.registerMarker(0)!, x: this.term.buffer.active.cursorX };
    this.decos = [];
  }
  /** OSC 133;C: command submitted; its colors stay as written. */
  end() { this.start = null; }

  /** Recolor the input after the shell has echoed/redrawn it. */
  update() {
    if (!this.start || this.start.marker.isDisposed) return;
    for (const d of this.decos) d.dispose();
    this.decos = [];
    if (!prefs.hlInput) return;
    const buf = this.term.buffer.active, cols = this.term.cols;
    // the logical line from the input start, following soft wraps
    let text = "", row = this.start.marker.line;
    const rows: number[] = [];
    for (let r = row; r < buf.length; r++) {
      const l = buf.getLine(r);
      if (!l || (r > row && !l.isWrapped)) break;
      rows.push(r);
      text += l.translateToString(false, r === row ? this.start.x : 0, cols);
    }
    text = text.replace(/\s+$/, "");
    const cursorAbs = buf.baseY + buf.cursorY;
    for (const [a, b, role] of shellTokens(text)) {
      // offsets → cells (one cell per char; fine for commands)
      for (let i = a; i < b; ) {
        const abs = i + this.start.x, r = Math.floor(abs / cols), x = abs % cols;
        const w = Math.min(b - i, cols - x);
        const marker = this.term.registerMarker(rows[0] + r - cursorAbs);
        const d = marker && this.term.registerDecoration({ marker, x, width: w, foregroundColor: prefs.colors[role] });
        if (d) { d.onDispose(() => marker!.dispose()); this.decos.push(d); }
        i += w;
      }
    }
  }
}
