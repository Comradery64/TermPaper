# TermPaper typed-command colors for zsh, via zsh-syntax-highlighting.
# Source this after the plugin, e.g. in ~/.zshrc:
#   source $(brew --prefix)/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
#   TERMPAPER_PEN=fountain source ~/.config/ghostty/termpaper/termpaper.zsh
# Pens: fountain (default), ballpoint, pencil, felt. Colors match src/prefs.ts PRESETS.

typeset -A tp
case ${TERMPAPER_PEN:-fountain} in
  ballpoint) tp=(ink '#1f3fbf' command '#1f3fbf' flag '#4a4a4a' string '#c62828' number '#1f3fbf'
                 path '#1a1a1a' variable '#c62828' operator '#777777' error '#c62828') ;;
  pencil)    tp=(ink '#3a3d47' command '#1e2026' flag '#5a5e6a' string '#4a4d57' number '#4a4d57'
                 path '#3a3d47' variable '#5a5e6a' operator '#8a8d96' error '#7a2a24') ;;
  felt)      tp=(ink '#0e1e80' command '#c2185b' flag '#6a1b9a' string '#2e7d32' number '#e65100'
                 path '#00838f' variable '#6a1b9a' operator '#757575' error '#d50000') ;;
  *)         tp=(ink '#0e1e80' command '#0b3a8c' flag '#7b3f8c' string '#2e7d32' number '#9a5a00'
                 path '#0e6e7c' variable '#8e3f9e' operator '#6b6f7b' error '#b3261e') ;;
esac

typeset -gA ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[default]="fg=$tp[ink]"
for k in command builtin alias function precommand hashed-command suffix-alias global-alias reserved-word
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[command]"; done
for k in single-hyphen-option double-hyphen-option
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[flag]"; done
for k in single-quoted-argument double-quoted-argument dollar-quoted-argument back-quoted-argument
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[string]"; done
for k in path path_prefix globbing
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[path]"; done
for k in assign dollar-double-quoted-argument back-double-quoted-argument
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[variable]"; done
for k in commandseparator redirection named-fd numeric-fd
  do ZSH_HIGHLIGHT_STYLES[$k]="fg=$tp[operator]"; done
ZSH_HIGHLIGHT_STYLES[arithmetic-expansion]="fg=$tp[number]"
ZSH_HIGHLIGHT_STYLES[unknown-token]="fg=$tp[error]"
unset tp k
