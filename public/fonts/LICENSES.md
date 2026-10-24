# Bundled fonts

TermPaper's code is MIT (see `/LICENSE`). The fonts below are third-party and keep their own license,
listed below (full texts alongside this file). Copies of the same files also live in
`Monaspace Radon/` and `fonts-src/`.

| Family | Copyright | License |
|---|---|---|
| Monaspace Radon | Copyright (c) 2023, GitHub https://github.com/githubnext/monaspace, with Reserved Font Name "Monaspace" | OFL 1.1, `OFL-Monaspace.txt` |
| Victor Mono | Copyright (c) 2021, Rune Bjørnerås (https://github.com/rubjo) | OFL 1.1, `OFL-VictorMono.txt` |
| Maple Mono | Copyright 2022 The Maple Mono Project Authors (https://github.com/subframe7536/maple-font) | OFL 1.1, `OFL-MapleMono.txt` |
| Illinois Mono | Copyright 2024 MadSimple (https://github.com/MadSimple/illinois-mono) | OFL 1.1, `OFL-IllinoisMono.txt` |
| OpenDyslexic Mono | © Bitstream; OpenDyslexic changes © 2012 Abelardo Gonzalez (https://opendyslexic.org) | Bitstream Vera license + CC BY 3.0, `OpenDyslexicMono-LICENSE` |
| Comic Mono | Copyright (c) 2018 Shannon Miwa, 2019 dtinth (https://github.com/dtinth/comic-mono-font) | MIT, `ComicMono-LICENSE` |

Texts were fetched from each project's upstream repository.

## Derived data

`public/pen-*.json` hold handwriting strokes computed from these fonts' glyph outlines by `tools/pen_strokes.py`
(centre lines of each glyph). Treat them as derived data of the fonts under the same OFL terms; `tools/pen_strokes.py <ttf> <out>`
names the source font of each file (see the README).
