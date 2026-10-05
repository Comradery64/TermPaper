"""Derive handwriting strokes for Monaspace Radon glyphs.

For each printable ASCII glyph: rasterize, skeletonize to a centerline, split
the skeleton into segments at junctions, chain segments into pen strokes
(continue through a junction along the straightest path), order strokes the
way a hand would (top-left first), and emit em-relative polylines.

Output: public/<out>  { "w": nib width (em), "asc"/"desc": hhea metrics (em), "glyphs": { "a": [[[x,y],...], ...] } }
Run: /tmp/texenv/bin/python tools/pen_strokes.py [font.ttf out.json]
"""
import json, math, sys
from fontTools.ttLib import TTFont
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize

FONT, OUT = sys.argv[1:3] if len(sys.argv) > 2 else ("Monaspace Radon/monaspace-radon-latin-400-normal.ttf", "pen-strokes.json")
S = 200          # px per em for rasterizing
PAD = 60
font = ImageFont.truetype(FONT, S)

def raster(ch):
    im = Image.new("L", (S + 2 * PAD, S + 2 * PAD), 0)
    ImageDraw.Draw(im).text((PAD, PAD + S), ch, fill=255, font=font, anchor="ls")
    return np.array(im) > 128

N8 = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

def neighbors(sk, p):
    r, c = p
    return [(r+dr, c+dc) for dr, dc in N8 if 0 <= r+dr < sk.shape[0] and 0 <= c+dc < sk.shape[1] and sk[r+dr, c+dc]]

def segments(sk):
    """Split skeleton pixels into polylines between endpoints/junctions."""
    pts = {tuple(p) for p in np.argwhere(sk)}
    deg = {p: len(neighbors(sk, p)) for p in pts}
    nodes = {p for p in pts if deg[p] != 2}
    # a closed loop with no endpoint/junction (o, the bowls of %) needs a cut: use its top pixel
    labels, n = ndimage.label(sk, structure=np.ones((3, 3)))
    for k in range(1, n + 1):
        comp = {tuple(p) for p in np.argwhere(labels == k)}
        if not (comp & nodes):
            nodes.add(min(comp))
    visited = set()
    segs = []
    for n in nodes:
        for nb in neighbors(sk, n):
            if (n, nb) in visited: continue
            path = [n, nb]; visited.add((n, nb)); visited.add((nb, n))
            prev, cur = n, nb
            while cur not in nodes:
                nxt = [q for q in neighbors(sk, cur) if q != prev]
                if not nxt: break
                prev, cur = cur, nxt[0]
                visited.add((prev, cur)); visited.add((cur, prev))
                path.append(cur)
            segs.append(path)
    # spurs (dangling segments shorter than ~1.2 nib widths) are skeletonization noise
    spur = 0.6 * 0.0854 * S * 2
    segs = [s for s in segs if not ((deg.get(s[0], 0) == 1 or deg.get(s[-1], 0) == 1) and len(s) < spur)]
    # tiny connectors between two junctions are one junction smeared by rasterization
    return [s for s in segs if not (s[0] in nodes and s[-1] in nodes and len(s) < 0.8 * 0.0854 * S)]

def direction(seg, at_start):
    a, b = (seg[0], seg[min(5, len(seg)-1)]) if at_start else (seg[-1], seg[max(0, len(seg)-6)])
    v = np.array(b, float) - np.array(a, float)
    n = np.linalg.norm(v)
    return v / n if n else v

def chain(segs, start=None, sharp=0.2):
    """Join segments into strokes, continuing through junctions along the straightest path.
    start(x, y) -> score: the first stroke begins at the segment end scoring highest.
    sharp: turns tighter than this (cosine) start a new stroke."""
    strokes, used = [], [False] * len(segs)
    near = 0.8 * 0.0854 * S   # junction ends within one nib width count as the same junction
    def ends_at(p, i):
        return [(j, k) for j, s in enumerate(segs) if not used[j] and j != i for k in (0, -1) if math.dist(s[k], p) <= near]
    order = sorted(range(len(segs)), key=lambda i: (segs[i][0][1] + segs[i][0][0]))  # top-left-ish first
    seed = max(((i, k) for i in range(len(segs)) for k in (0, -1)), key=lambda ik: start(segs[ik[0]][ik[1]][1], segs[ik[0]][ik[1]][0])) if start and segs else None
    if seed: order.insert(0, seed[0])
    for i in order:
        if used[i]: continue
        used[i] = True
        s = list(segs[i])
        if seed and i == seed[0]:
            if seed[1] == -1: s.reverse()
        # orient: start at the end that is more top-left
        elif (s[-1][0] + s[-1][1]) < (s[0][0] + s[0][1]): s.reverse()
        while True:
            cands = ends_at(s[-1], i)
            if not cands: break
            out = -direction(s, at_start=False)        # incoming direction at the junction
            best = max(cands, key=lambda jk: float(np.dot(-out, direction(segs[jk[0]] if jk[1] == 0 else segs[jk[0]][::-1], True))))
            j, k = best
            nxt = segs[j] if k == 0 else segs[j][::-1]
            if float(np.dot(-out, direction(nxt, True))) < sharp: break   # too sharp: a new stroke
            used[j] = True
            s += nxt[1:]
        strokes.append(s)
    def length(s): return sum(math.dist(s[i], s[i+1]) for i in range(len(s)-1))
    return [s for s in strokes if length(s) >= 10]

def simplify(pts, tol=1.2):
    """Ramer–Douglas–Peucker."""
    if len(pts) < 3: return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    ab = b - a; n = np.linalg.norm(ab)
    d = [abs(ab[0]*(p[1]-a[1]) - ab[1]*(p[0]-a[0])) / n if n else np.linalg.norm(np.array(p, float) - a) for p in pts]
    i = int(np.argmax(d))
    if d[i] > tol:
        return simplify(pts[:i+1], tol)[:-1] + simplify(pts[i:], tol)
    return [pts[0], pts[-1]]

def merge_lines(glyph, tol=0.05, max_deg=25):
    """Join stroke pieces that continue each other in a straight line (skeleton junctions cut `#` into stubs)."""
    def ang(s): return math.degrees(math.atan2(s[-1][1] - s[0][1], s[-1][0] - s[0][0]))
    glyph = [list(s) for s in glyph]
    merged = True
    while merged:
        merged = False
        for i in range(len(glyph)):
            for j in range(len(glyph)):
                if i == j: continue
                a, b = glyph[i], glyph[j]
                for b2 in (b, b[::-1]):
                    d = abs((ang(a) - ang(b2) + 180) % 360 - 180)
                    if math.dist(a[-1], b2[0]) < tol and d < max_deg:
                        glyph[i] = a + b2[1:]; del glyph[j]; merged = True; break
                if merged: break
            if merged: break
    return glyph

def is_vertical(s): return abs(s[-1][1] - s[0][1]) > abs(s[-1][0] - s[0][0])

def verticals_then_horizontals(glyph):
    """Verticals left to right, then horizontals top to bottom; every line drawn top-down / left-to-right."""
    v = sorted((p if p[0][1] < p[-1][1] else p[::-1] for p in glyph if is_vertical(p)), key=lambda s: s[0][0])
    h = sorted((p if p[0][0] < p[-1][0] else p[::-1] for p in glyph if not is_vertical(p)), key=lambda s: s[0][1])
    return v + h

def down(s): return s if s[0][1] <= s[-1][1] else s[::-1]
def rightward(s): return s if s[0][0] <= s[-1][0] else s[::-1]

def horizontals_then_verticals(glyph):
    """+ and =: crossbars top to bottom, left to right; then any upright, downward."""
    v = sorted((down(p) for p in glyph if is_vertical(p)), key=lambda s: s[0][0])
    h = sorted((rightward(p) for p in glyph if not is_vertical(p)), key=lambda s: s[0][1])
    return h + v

def asterisk(glyph):
    """*: rebuilt as straight arms through the hub. Opposite arms make one line.
    The upright goes first, downward; then the diagonals, each from its top tip, top-left one first."""
    ends = [p for st in glyph for p in (st[0], st[-1])]
    hub = np.mean(np.array(ends), axis=0)
    far = max(math.dist(p, hub) for p in ends)
    tips = []
    for p in sorted(ends, key=lambda p: -math.dist(p, hub)):
        if math.dist(p, hub) > 0.5 * far and all(math.dist(p, t) > 0.06 for t in tips): tips.append(p)
    ang = lambda t: math.atan2(t[1] - hub[1], t[0] - hub[0])
    lines, left = [], list(tips)
    while left:
        t = left.pop(0)
        opp = min(left, key=lambda u: abs(abs((ang(t) - ang(u) + math.pi) % (2 * math.pi) - math.pi) - math.pi), default=None)
        if opp is not None and abs(abs((ang(t) - ang(opp) + math.pi) % (2 * math.pi) - math.pi) - math.pi) < math.radians(35):
            left.remove(opp); lines.append(down([list(t), list(opp)]))
        else:
            lines.append(down([list(t), [round(float(hub[0]), 4), round(float(hub[1]), 4)]]))
    upright = max(lines, key=lambda s: abs(s[-1][1] - s[0][1]) / (math.dist(s[0], s[-1]) or 1))
    return [upright] + sorted((s for s in lines if s is not upright), key=lambda s: s[0][0])

def dollar(_glyph):
    """$: an S in one sweep (this font's own S, fitted to the $'s S), then the bar, downward.
    A bar that crosses the whole S is one line; a split bar (top and bottom stubs) is two."""
    mask = raster("$")
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    width = cols[-1] - cols[0] + 1
    wide = [r for r in rows if mask[r].sum() > 0.3 * width]   # rows that belong to the S, not the bar tips
    s_top, s_bot = wide[0], wide[-1]
    sg = glyph_strokes("S", START["S"])
    xs = [p[0] for st in sg for p in st]; ys = [p[1] for st in sg for p in st]
    to = lambda c, r: [round((c - PAD) / S, 4), round((r - PAD - S) / S, 4)]
    fit = lambda x, y: to(cols[0] + (x - min(xs)) / (max(xs) - min(xs)) * (width - 1),
                          s_top + (y - min(ys)) / (max(ys) - min(ys)) * (s_bot - s_top))
    curve = [[fit(x, y) for x, y in st] for st in sg]
    # bar: from the topmost ink pixel to the bottommost, split wherever the line leaves the ink
    top = (rows[0], float(np.mean(np.where(mask[rows[0]])[0])))
    bot = (rows[-1], float(np.mean(np.where(mask[rows[-1]])[0])))
    n = int(bot[0] - top[0]) + 1
    line = [(top[0] + i, top[1] + (bot[1] - top[1]) * i / (n - 1)) for i in range(n)]
    ink = [mask[int(r), int(round(c))] for r, c in line]
    runs, cur = [], []
    for (r, c), k in zip(line, ink):
        if k: cur.append((r, c))
        elif cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    bar = [runs[0], runs[-1]] if len(runs) > 2 else [line]
    return curve + [[to(c, r) for r, c in (b[0], b[-1])] for b in bar]

def ampersand(glyph):
    """&: written top-down. Strokes in order of their highest point; each starts from its upper end."""
    top = lambda st: min(p[1] for p in st)
    return [st if st[0][1] <= st[-1][1] else st[::-1] for st in sorted(glyph, key=top)]

# where the first stroke starts, for glyphs written as one sweep (pixel x, y; y down)
MID = PAD + S - 0.36 * S        # roughly mid x-height-to-cap, in raster rows
START = {
    "$": lambda x, y: x - (0 if y < MID else 10 * S),   # S: upper-right terminal
    "&": lambda x, y: x + y,                              # &: tail at bottom right, up through the loops
    "S": lambda x, y: x - (0 if y < MID else 10 * S),   # S: upper-right terminal (also used for $)
}
SWEEP = {"&", "S"}   # one continuous stroke: follow sharp turns instead of lifting the pen
# hand-chosen stroke order for glyphs the generic heuristic gets wrong
ORDER = {
    "#": lambda g: verticals_then_horizontals(merge_lines(g)),
    "+": lambda g: horizontals_then_verticals(merge_lines(g)),
    "=": lambda g: horizontals_then_verticals(merge_lines(g)),
    "*": asterisk,
    "$": dollar,
    "&": ampersand,
}

def glyph_strokes(ch, start=None):
    """Skeleton strokes for one glyph, em units, y down from the baseline."""
    sk = skeletonize(raster(ch))
    strokes = chain(segments(sk), start, -0.9 if ch in SWEEP else 0.2)
    key = lambda s: (min(p[1] for p in s) * 0.6 + min(p[0] for p in s))  # left, then top
    strokes = strokes[:1] + sorted(strokes[1:], key=key) if start else sorted(strokes, key=key)
    return [[[round((c - PAD) / S, 4), round((r - PAD - S) / S, 4)] for r, c in simplify([(int(r), int(c)) for r, c in st])]
            for st in strokes]

out, widths = {}, []
for code in range(0x21, 0x7f):
    ch = chr(code)
    mask = raster(ch)
    if not mask.any(): continue
    sk = skeletonize(mask)
    dist = ndimage.distance_transform_edt(mask)
    widths.append(float(np.median(dist[sk]) * 2))
    glyph = glyph_strokes(ch, START.get(ch))
    out[ch] = ORDER[ch](glyph) if ch in ORDER else glyph

tt = TTFont(FONT); upm = tt["head"].unitsPerEm
asc, desc = tt["hhea"].ascent / upm, tt["hhea"].descent / upm
json.dump({"w": round(float(np.median(widths)) / S, 4), "asc": round(asc, 4), "desc": round(desc, 4), "glyphs": out},
          open("public/" + OUT, "w"), separators=(",", ":"))
print(OUT, "glyphs:", len(out), "nib(em):", round(float(np.median(widths)) / S, 4), "asc/desc:", round(asc, 4), round(desc, 4))
for ch in "aeBk%":
    print(ch, "strokes:", len(out[ch]), [len(s) for s in out[ch]])

# debug sheet: strokes colored in order, start of each stroke marked
sample = "#+=*$&SaeBk%"
sheet = Image.new("RGB", (len(sample) * 160, 240), "white")
dr = ImageDraw.Draw(sheet)
cols = ["#1c2a60", "#b3261e", "#2e7d32", "#8a6d00", "#7b3f8c", "#0e6e7c", "#555"]
for i, ch in enumerate(sample):
    ox, oy = i * 160 + 20, 180
    for j, st in enumerate(out[ch]):
        pts = [(ox + x * 150, oy + y * 150) for x, y in st]
        if len(pts) > 1: dr.line(pts, fill=cols[j % len(cols)], width=4, joint="curve")
        dr.ellipse([pts[0][0]-5, pts[0][1]-5, pts[0][0]+5, pts[0][1]+5], fill=cols[j % len(cols)])
        dr.text((pts[0][0]+6, pts[0][1]-14), str(j+1), fill=cols[j % len(cols)])
sheet.save("/tmp/strokes_debug.png")
