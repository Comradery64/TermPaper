# TermPaper for Ghostty

TermPaper's look in stock [Ghostty](https://ghostty.org) (1.2+): ink-on-paper colors,
paper texture, ruled lines, margin line, binder holes, pressed-in ink, and colored
typed commands.

## Install

```sh
brew install --cask ghostty font-monaspace
brew install zsh-syntax-highlighting

mkdir -p ~/.config/ghostty/themes ~/.config/ghostty/termpaper
cp themes/* ~/.config/ghostty/themes/
cp paper.png paper.glsl termpaper.zsh ~/.config/ghostty/termpaper/
cat config >> ~/.config/ghostty/config
```

Add to `~/.zshrc`:

```sh
source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
TERMPAPER_PEN=fountain source ~/.config/ghostty/termpaper/termpaper.zsh
```

Reload Ghostty with `Cmd+Shift+,` and open a new tab.

## Pens

| Pen | Ghostty `theme =` | `TERMPAPER_PEN=` |
| --- | --- | --- |
| Fountain pen | `TermPaper Fountain Pen` | `fountain` |
| Ballpoint | `TermPaper Ballpoint` | `ballpoint` |
| Pencil | `TermPaper Pencil` | `pencil` |
| Felt tips | `TermPaper Fountain Pen` | `felt` |

## Not carried over

Output highlighting, per-letter pen strokes, the line-number gutter and the settings
card need TermPaper itself.

## Other fonts

The shader takes row height from the cursor. With an underline or bar cursor it
estimates it from `CELL_RATIO` (row height / cell width) at the top of `paper.glsl`,
tuned for Monaspace Radon with `adjust-cell-height = 60%`. If the rules drift off the
text rows with another font, set `CELL_RATIO` to that font's ratio.
