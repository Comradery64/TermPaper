# Bundled fonts

TermPaper's code is MIT (see `/LICENSE`). The fonts below are third-party and keep their own license,
the SIL Open Font License 1.1 (full texts alongside this file). Copies of the same files also live in
`Monaspace Radon/` and `fonts-src/`.

| Family | Copyright | License text |
|---|---|---|
| Monaspace Radon | Copyright (c) 2023, GitHub https://github.com/githubnext/monaspace, with Reserved Font Name "Monaspace" | `OFL-Monaspace.txt` |
| Victor Mono | Copyright (c) 2021, Rune Bjørnerås (https://github.com/rubjo) | `OFL-VictorMono.txt` |
| Maple Mono | Copyright 2022 The Maple Mono Project Authors (https://github.com/subframe7536/maple-font) | `OFL-MapleMono.txt` |

Texts were fetched from each project's upstream repository.

## Derived data

`public/pen-*.json` hold handwriting strokes computed from these fonts' glyph outlines by `tools/pen_strokes.py`
(centre lines of each glyph). Treat them as derived data of the fonts under the same OFL terms; `tools/pen_strokes.py <ttf> <out>`
names the source font of each file (see the README).
