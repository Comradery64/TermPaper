#!/bin/sh
# Render tools/icon/icon.html with headless Chrome (app-icon-from-ui skill):
#   icon-art.png  full-bleed 1024px art
#   icon.png      the macOS grid version: 824px rounded square centred on 1024, soft drop shadow,
#                 transparent outside. Feed it to `pnpm tauri icon tools/icon/icon.png`.
set -e
cd "$(dirname "$0")"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$chrome" --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --default-background-color=00000000 --window-size=1024,1024 --virtual-time-budget=2000 \
  --screenshot="$PWD/icon-art.png" "file://$PWD/icon.html" >/dev/null 2>&1
magick icon-art.png -resize 824x824 \
  \( -size 824x824 xc:none -fill white -draw "roundrectangle 0,0 823,823 185,185" \) \
  -alpha set -compose DstIn -composite +compose /tmp/termpaper-masked.png
magick /tmp/termpaper-masked.png -background none -gravity center -extent 1024x1024 \
  \( +clone -background black -shadow 35x10+0+10 \) +swap -compose Over -composite icon.png
echo "rendered"
