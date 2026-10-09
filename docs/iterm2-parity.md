# iTerm2 parity plan

Goal: iTerm2 users switch for the paper look and keep their muscle memory.
Status key: HAVE / PART / MISS. Priority: P0 dealbreaker, P1 power users expect, P2 niche.
Effort is rough, for one dev who knows the code.

Sources: TermPaper code audit (2026-10-09) and iTerm2 docs (escape codes, features, dynamic profiles, tmux).
Items marked (verify) came from memory and still need checking against a real iTerm2.

## Phase 0: one-liners and backend hygiene (1–2 days)

These fix everyday breakage. Nothing else should ship before them.

| Item | Pri | Status | Fix |
|---|---|---|---|
| Option as Meta (left/right separately) | P0 | MISS | `macOptionIsMeta`; per-side needs a keydown shim |
| Login shell (`-l`), so `.zprofile` PATH loads | P0 | MISS | spawn arg in `lib.rs` |
| `COLORTERM=truecolor`, `LANG`, `TERM_PROGRAM_VERSION` | P0 | MISS | env in `lib.rs` |
| Child exit: show "process exited", close or respawn | P0 | MISS | wait thread, emit event |
| Ctrl+, / Ctrl+- / Ctrl+⇧F swallowed (Cmd only on mac) | P0 | bug | `zoomKeys` in `main.ts` |
| Unicode 11 / grapheme widths (emoji, CJK) | P0 | PART | `addon-unicode11` |
| 2s input gate for non-zsh shells | P1 | bug | gate only when the zsh shim is in use |
| Faster I/O (JSON number arrays) | P1 | PART | raw `ArrayBuffer` / base64 channel |
| Bundle `.app` / dmg | P0 | MISS | `bundle.active` |

## Phase 1: multi-session core (1–2 weeks)

Tabs, splits and windows all depend on the PTY singleton becoming a session map.

| Item | Pri | Status | Notes |
|---|---|---|---|
| PTY session map (id → Pty) | P0 | MISS | prerequisite for everything below |
| Tabs, ⌘T, ⌘W, ⌘1–9, ⌘⇧[ ] | P0 | MISS | concepts in `tools/tabs-concepts/` |
| Splits ⌘D / ⌘⇧D, ⌘[ ⌘], ⌘⌥ arrows, dim inactive | P0 | MISS | PLAN.md says "use tmux"; this reverses that |
| Maximize pane ⌘⇧↩ | P1 | MISS | |
| Multiple windows ⌘N | P0 | MISS | capability allows only `main` |
| New tab/pane inherits cwd (OSC 7 + OSC 1337 CurrentDir) | P0 | MISS | shim emits OSC 7 |
| Hotkey / dropdown window | P0 | MISS | `tauri-plugin-global-shortcut`, float over full-screen |
| Broadcast input ⌘⌥I | P1 | MISS | |
| Custom menu bar (Shell, View, Window) | P0 | PART | `Menu::default` only |
| Window/session restore on relaunch | P1 | MISS | `addon-serialize` for scrollback |
| Arrangements (save/restore layouts) | P1 | MISS | |
| Tab/pane titles from OSC 0/2 and interpolated vars | P1 | MISS | |

## Phase 2: find, select, links, paste (1 week)

| Item | Pri | Status | Notes |
|---|---|---|---|
| Find ⌘F, regex, case, ⌘G/⌘⇧G, ⌘E | P0 | MISS | `addon-search` |
| Global search across tabs | P1 | MISS | after Phase 1 |
| Copy on select, middle-click paste | P0 | MISS | prefs toggle |
| Rectangular select ⌘⌥ drag | P1 | MISS | xterm `altClickMovesCursor`/`macOptionClickForcesSelection` |
| ⌘-click URLs + OSC 8 links | P0 | MISS | `addon-web-links` + `linkHandler` + opener plugin |
| Semantic history: ⌘-click `file:line` opens editor | P1 | MISS | path regex, editor pref |
| Smart selection (quad-click rules + actions) | P1 | MISS | |
| Option-click moves cursor | P1 | MISS | `altClickMovesCursor` |
| Multi-line / sudo paste warning | P1 | MISS | |
| Advanced paste ⌘⇧V (strip, escape, base64, slow) | P2 | MISS | |
| Paste history ⌘⇧H | P1 | MISS | |
| Copy mode ⌘⇧C (vi keys) | P1 | MISS | |
| Drag-drop file → quoted path | P1 | MISS | `onDragDropEvent` |
| OSC 52 clipboard (tmux/ssh copy) | P0 | MISS | `addon-clipboard` |

## Phase 3: shell integration (1 week)

There is a good base: OSC 133 A/B/C is already emitted and parsed.

| Item | Pri | Status | Notes |
|---|---|---|---|
| Jump prompts ⌘⇧↑/↓ | P0 | PART | markers exist in `LineNumbers.prompts` |
| Select last command output ⌘⇧A | P1 | MISS | |
| Exit status mark (OSC 133;D) | P1 | PART | parsed, ignored |
| bash + fish shims | P0 | MISS | zsh only |
| Accept iTerm2's OSC 1337 SetMark/CurrentDir/RemoteHost | P1 | MISS | users' existing `~/.iterm2_shell_integration.*` keeps working |
| Notify when a long command finishes / alert on next mark ⌘⌥A | P1 | MISS | notification plugin |
| OSC 9 / 777 notifications | P1 | MISS | |
| Command history ⌘⇧; and recent dirs ⌘⌥/ popups | P1 | MISS | |
| Autocomplete from screen ⌘; | P1 | MISS | |
| Marks ⌘⇧M, annotations | P2 | MISS | |
| Timestamps per line | P1 | MISS | (verify chord) |

## Phase 4: profiles, keys, import (2 weeks)

| Item | Pri | Status | Notes |
|---|---|---|---|
| Profiles (shell, cwd, colors, font, initial cmd) | P0 | MISS | ink presets are a start |
| Key mappings UI + presets ("Natural Text Editing", Esc+) | P0 | MISS | |
| User config file + hot reload | P1 | MISS | TOML is planned (HANDOFF) |
| Expose: scrollback (incl. unlimited), line height, cursor style, bell | P1 | PART | hard-coded today |
| Any system font, non-ASCII font, ligatures | P0 | PART | fixed list, no ligatures on DOM renderer |
| Minimum contrast, bold-as-bright, smart cursor color | P1 | PART | the luminance clamp already does some of this |
| Dark paper / follow OS appearance | P1 | MISS | |
| Automatic profile switching (host/user/path) | P1 | MISS | needs RemoteHost |
| Dynamic Profiles JSON (watched folder) | P2 | MISS | |
| Bell: sound / visual / dock bounce | P1 | MISS | `term.onBell` |
| Secure Keyboard Entry | P1 | MISS | `EnableSecureEventInput` via objc |
| Screen reader mode | P1 | MISS | `screenReaderMode` |

### Importer (part of Phase 4, ~3 days)

- Read `~/Library/Preferences/com.googlecode.iterm2.plist` (binary; convert with `plutil`).
  Map `New Bookmarks` → profiles, `Default Bookmark Guid`, `GlobalKeyMap`, per-profile `Keyboard Map`.
- Per profile: `Normal Font` ("Name Size"), `Ansi 0–15 Color`, fg/bg/cursor/selection, `Working Directory`/`Custom Directory`, `Command`, `Initial Text`, `Scrollback Lines`, `Columns`/`Rows`. (verify key names against a real plist)
- Import `.itermcolors` files, then map them onto ink roles: the paper stays light, but the hues carry over.
- Read `~/Library/Application Support/iTerm2/DynamicProfiles/*`.
- Also read Ghostty and Alacritty configs, which cost little once the mapper exists.
- First-run prompt: "Found your iTerm2 setup. Bring it over?"

## Phase 5: power features (3–6 weeks, demand-driven)

| Item | Pri | Notes |
|---|---|---|
| tmux -CC control mode → native tabs/panes | P0 for tmux users | the most-loved iTerm2 feature; no other terminal has it. Big: parse control-mode protocol, map windows/panes |
| Inline images: OSC 1337 File, imgcat, sixel | P1 | `addon-image`; canvas loses paper filters; needs pixel size in `resize` |
| Kitty graphics | P2 | not in xterm.js |
| Triggers (regex → highlight/notify/send/mark/capture) | P1 | "limited triggers" is a common complaint about alternatives |
| Captured output, coprocesses | P1/P2 | |
| Badges (OSC 1337 SetBadgeFormat) | P1 | fits the paper look as a watermark/stamp |
| Status bar (git, cwd, host, clock, CPU) | P1 | |
| Toolbelt (notes, jobs, paste history, snippets) | P1 | |
| Password manager (Keychain, type at prompt) | P1 | |
| it2dl / it2ul / it2copy over ssh | P1 | via OSC 1337 File and Copy |
| Remaining OSC 1337: SetUserVar, ReportCellSize, CursorShape, SetColors, RequestAttention, ClearScrollback, StealFocus | P1 | cheap once the OSC handler exists |
| Instant replay ⌘⌥B | P2 | |
| Composer (multi-line command editor) | P2 | |
| Open Quickly ⌘⇧O | P2 | |
| Scripting API (iTerm2's Python API is the reference) | P2 | expose a local socket/JSON API |
| AI chat / generate command | P2 | iTerm2 3.5+ has it; Claude fits naturally |
| Tab groups, workgroups, browser panes (3.7) | P2 | skip |

## Order and total

Phase 0 → 1 → 2 → 3 → 4 (with importer) gives a credible switch: **~6–8 weeks**.
Phase 5 adds another 3–6 weeks. Its order should follow what switchers actually ask for.

Risk: features that need canvas (images, WebGL) break the CSS paper effects. Images need their own paper treatment, either a CSS overlay above the canvas or a pre-filter on the bitmap.
