"""Block elements (U+2580-259F) and light box drawing that fill the whole 1.6-line-height cell.

Fonts draw these 1 em tall, so with TermPaper's tall rows the Claude mascot, progress bars
and boxes come apart in horizontal strips. These glyphs are sized to each text font's cell
(measured in the browser: baseline-to-cell-top/bottom in em) plus a little overshoot so
neighbouring rows meet. Loaded with unicode-range under each family name in style.css.

Output: public/fonts/blocks-<key>.ttf
Run: /tmp/texenv/bin/python tools/block_glyphs.py
"""
import math
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UPM = 1000
OVER = 0.07    # em past the measured cell edge; covers row-height rounding
# key: (advance em, cell top above baseline em, cell bottom below baseline em)
FONTS = {
    "radon": (0.62, 1.091, 0.545),
    "victor": (0.5455, 1.333, 0.605),
    "maple": (0.6, 1.455, 0.727),
}

# blocks as (x0, y0, x1, y1) fractions of the cell, y from the top
UL, UR, LL, LR = (0, 0, .5, .5), (.5, 0, 1, .5), (0, .5, .5, 1), (.5, .5, 1, 1)
BLOCKS = {0x2580: [(0, 0, 1, .5)], 0x2588: [(0, 0, 1, 1)], 0x2590: [(.5, 0, 1, 1)],
          0x2594: [(0, 0, 1, 1 / 8)], 0x2595: [(7 / 8, 0, 1, 1)],
          0x2596: [LL], 0x2597: [LR], 0x2598: [UL], 0x2599: [UL, LL, LR], 0x259A: [UL, LR],
          0x259B: [UL, UR, LL], 0x259C: [UL, UR, LR], 0x259D: [UR], 0x259E: [UR, LL], 0x259F: [UR, LL, LR]}
for k in range(1, 8):
    BLOCKS[0x2580 + k] = [(0, 1 - k / 8, 1, 1)]          # ▁..▇ lower k/8
    BLOCKS[0x2588 + k] = [(0, 0, (8 - k) / 8, 1)]        # ▉..▏ left (8-k)/8
# light box drawing: arms from the centre (l, r, u, d); rounded corners get an arc
BOX = {0x2500: "lr", 0x2502: "ud", 0x250C: "rd", 0x2510: "ld", 0x2514: "ru", 0x2518: "lu",
       0x251C: "udr", 0x2524: "udl", 0x252C: "lrd", 0x2534: "lru", 0x253C: "lrud"}
ARCS = {0x256D: "rd", 0x256E: "ld", 0x256F: "lu", 0x2570: "ru"}
LIGHT = 0.075  # line thickness, em

def build(key, adv, top, bot):
    W = round(adv * UPM)
    T, B = (top + OVER) * UPM, -(bot + OVER) * UPM     # glyph y of cell top / bottom (with overshoot)
    ct, cb = top * UPM, -bot * UPM                     # exact cell edges, for internal splits
    def Y(f):   # cell fraction from top → font y; outer edges get the overshoot
        return T if f == 0 else B if f == 1 else ct + (cb - ct) * f
    glyphs, cmap = {".notdef": TTGlyphPen(None).glyph()}, {}
    def rect(pen, x0, y0, x1, y1):     # font units, y up; clockwise
        pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    def add(cp, draw):
        pen = TTGlyphPen(None); draw(pen)
        name = f"uni{cp:04X}"; glyphs[name] = pen.glyph(); cmap[cp] = name
    for cp, rs in BLOCKS.items():
        add(cp, lambda pen, rs=rs: [rect(pen, round(x0 * W), round(Y(y1)), round(x1 * W), round(Y(y0))) for x0, y0, x1, y1 in rs])
    t = LIGHT * UPM / 2
    cx, cy = W / 2, (ct + cb) / 2
    edge = {"l": (0, cy), "r": (W, cy), "u": (cx, T), "d": (cx, B)}
    def arm(pen, a):
        ex, ey = edge[a]
        if a in "lr": rect(pen, round(min(ex, cx - t if a == "r" else cx + t)), round(cy - t), round(max(ex, cx + t if a == "l" else cx - t)), round(cy + t))
        else: rect(pen, round(cx - t), round(min(ey, cy - t if a == "u" else cy + t)), round(cx + t), round(max(ey, cy + t if a == "d" else cy - t)))
    for cp, arms in BOX.items():
        add(cp, lambda pen, arms=arms: [arm(pen, a) for a in arms])
    for cp, arms in ARCS.items():
        def draw(pen, arms=arms):
            r = W / 2                                              # arc radius: half the cell width
            sx = 1 if "r" in arms else -1; sy = 1 if "u" in arms else -1
            ox, oy = cx + sx * r, cy + sy * r                      # arc centre
            # straight runs from the arc ends to the cell edges
            if sx > 0: rect(pen, round(ox), round(cy - t), W, round(cy + t))
            else: rect(pen, 0, round(cy - t), round(ox), round(cy + t))
            if sy > 0: rect(pen, round(cx - t), round(oy), round(cx + t), round(T))
            else: rect(pen, round(cx - t), round(B), round(cx + t), round(oy))
            # quarter ring between the two runs
            start = math.atan2(0, -sx)          # pointing from arc centre back toward the vertical run
            end = math.atan2(-sy, 0)            # pointing toward the horizontal run
            n = 12
            angs = [start + (end - start) * i / n for i in range(n + 1)]
            if abs(end - start) > math.pi: angs = [start + ((end - start) - math.copysign(2 * math.pi, end - start)) * i / n for i in range(n + 1)]
            outer = [(ox + (r + t) * math.cos(a), oy + (r + t) * math.sin(a)) for a in angs]
            inner = [(ox + (r - t) * math.cos(a), oy + (r - t) * math.sin(a)) for a in reversed(angs)]
            pts = outer + inner
            # TrueType outer contours run clockwise: flip if this came out counter-clockwise
            area = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
            if area > 0: pts.reverse()
            pen.moveTo(tuple(map(round, pts[0])))
            for p in pts[1:]: pen.lineTo(tuple(map(round, p)))
            pen.closePath()
        add(cp, draw)

    fb = FontBuilder(UPM, isTTF=True)
    order = list(glyphs)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    def lsb(g):   # browsers place the outline by the declared left bearing, so it must equal xMin
        if not hasattr(g, "coordinates") or not g.numberOfContours: return 0
        return min(x for x, _ in g.coordinates)
    fb.setupHorizontalMetrics({n: (W, lsb(glyphs[n])) for n in order})
    fb.setupHorizontalHeader(ascent=round(T), descent=round(B))
    fb.setupNameTable({"familyName": f"TermPaper Blocks {key}", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=round(T), sTypoDescender=round(B), usWinAscent=round(T), usWinDescent=round(-B))
    fb.setupPost()
    fb.save(f"public/fonts/blocks-{key}.ttf")

for key, (adv, top, bot) in FONTS.items():
    build(key, adv, top, bot)
    print("blocks", key)
