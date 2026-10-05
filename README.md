# TermPaper

A cross-platform terminal that looks like a sheet of ruled notebook paper. Monaspace Radon handwriting font,
fountain-pen-blue ink for what you type, charcoal for what the machine says, and an invisible pen that writes
each letter.

Built on [xterm.js](https://xtermjs.org) + [Tauri v2](https://tauri.app) + [portable-pty](https://crates.io/crates/portable-pty).

## Run

```sh
pnpm install
pnpm tauri dev          # app with a real shell
pnpm dev                # browser-only demo mode at http://localhost:1420 (fake prompt, local echo)
```

Requires Rust stable, Node 22, pnpm. macOS is the tested platform; Linux/Windows build but are unverified.

Debug: `http://localhost:1420/?pen=slow` plays the handwriting at 1/20 speed.

## Keys

| Key | Action |
|---|---|
| Cmd/Ctrl + = / − / 0 | Font size up / down / reset (ruling re-locks) |
| Cmd/Ctrl + , | Settings: font, size, line numbers (every row / each command / off), syntax highlighting (output on, typed commands off by default), ink theme presets with per-color pickers. Saved in localStorage `prefs` |
| Cmd/Ctrl + Shift + F | Cycle font: Radon → Victor Mono → Victor Cursive → Maple Mono → Maple Cursive (remembered; `?font=maple-cursive` in demo) |
| Cmd+C / Cmd+V / Cmd+A | Copy / paste / select all (macOS Edit menu) |

## Shell integration

zsh only, automatic: the app sets `ZDOTDIR` to an embedded shim (`src-tauri/shell/zsh/`) that sources your real
`.zshenv`/`.zshrc`, then adds OSC 133 prompt marks and turns off zsh's paste/yank standout highlight. Your files
are untouched. Other shells get all-charcoal text and a 2 s input delay at startup instead of prompt detection.

## Layout of the code

```
index.html                 sheet, rules, holes, header (drag strip), terminal mount
src/main.ts                xterm setup, PTY channel, write queue, OSC 133 → ink, SGR remaps, ruling, zoom, traffic lights
src/pen.ts                 handwriting playback for typed characters
src/style.css              everything paper: texture, ruling, margin, holes, deboss, cursor, scrollbar, pen overlay
src-tauri/src/lib.rs       spawn/write/resize PTY commands, zsh shim install, macOS traffic-light fade
src-tauri/shell/zsh/       ZDOTDIR shim (.zshenv, .zshrc)
tools/paper_texture.py     regenerates public/paper.png
tools/pen_strokes.py       regenerates public/pen-strokes.json from the Radon TTF
public/fonts/              Radon, Victor Mono, Maple Mono woff2
public/pen-*.json          handwriting strokes per font (tools/pen_strokes.py <ttf> <out>, TTFs in fonts-src/)
```

## Regenerating assets

```sh
uv venv /tmp/texenv && uv pip install --python /tmp/texenv/bin/python numpy pillow scipy scikit-image
/tmp/texenv/bin/python tools/paper_texture.py
/tmp/texenv/bin/python tools/pen_strokes.py      # also writes /tmp/strokes_debug.png to eyeball stroke order
```

## Tuning knobs

| What | Where |
|---|---|
| Paper grain | `tools/paper_texture.py` weights, `img = 246 + tex * 3.5` |
| Ruling / margin / hole colors | `:root` vars in `src/style.css` |
| Deboss depth | `.xterm .xterm-rows span { text-shadow }` |
| Baseline on the rule | `--baseline-shift` = fontSize / 3 in `applyRuling()` |
| Ink colors | `INK`, `GRAPHITE`, theme palette in `src/main.ts` |
| Pen speed | `SPEED_EM_PER_S`, `MIN_MS`, `MAX_MS`, `LIFT_MS` in `src/pen.ts` |
| Traffic-light zone / timing | `ZONE`, durations in `watchTrafficLights()` |

## License

Code: MIT. Monaspace Radon: SIL OFL 1.1.
