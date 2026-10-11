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

# --- lowercase in writing order: how a hand enters and leaves each letter -------------------
# Cursive joins run from where one letter's last body stroke ENDS to where the next letter's
# first stroke STARTS, so each letter's strokes are ordered and pointed the way a person
# writes it. Hints are (x across the glyph 0..1, height level): where the pen should come in
# and where it should leave. Dots (i, j) and crosses (t, f) are marks, written after the body.
pts_of = lambda ch: [p for st in out.get(ch, []) for p in st]
LEVEL = {"top": min(y for _, y in pts_of("l")), "mid": min(y for _, y in pts_of("x")),
         "base": 0.0, "desc": max(y for _, y in pts_of("p"))}
ENTRY = {  # where the pen comes in
    "a": (.75, "mid"), "c": (.85, "mid"), "d": (.7, "mid"), "g": (.75, "mid"), "o": (.6, "mid"), "q": (.75, "mid"),
    "e": (.05, .55), "s": (.55, "mid"), "f": (.9, "top"),
    "b": (.15, "top"), "h": (.15, "top"), "k": (.15, "top"), "l": (.35, "top"), "t": (.4, "top"),
    "i": (.3, "mid"), "j": (.4, "mid"), "m": (0, "mid"), "n": (0, "mid"), "p": (.1, "mid"), "r": (.1, "mid"),
    "u": (0, "mid"), "v": (0, "mid"), "w": (0, "mid"), "x": (0, "mid"), "y": (0, "mid"), "z": (0, "mid"),
}
EXIT = {   # where the pen leaves
    "b": (1, "mid"), "o": (1, "mid"), "v": (1, "mid"), "w": (1, "mid"), "r": (1, "mid"),
    "g": (.2, "desc"), "j": (.2, "desc"), "y": (.2, "desc"), "q": (1, "desc"), "f": (.5, "base"),
    "s": (.85, "base"), "p": (.6, "base"),
}
MARKS = {"i": "dot", "j": "dot", "t": "cross", "f": "cross"}

def hint_point(glyph, hint):
    xs = [x for st in glyph for x, _ in st]
    x0, x1 = min(xs), max(xs)
    hx, lv = hint
    y = LEVEL[lv] if isinstance(lv, str) else LEVEL["mid"] * lv   # a number: that fraction of the midline height
    return (x0 + hx * (x1 - x0), y)

def split_marks(ch, glyph):
    if ch not in MARKS or len(glyph) < 2: return glyph, []
    L = lambda st: sum(math.dist(st[i], st[i + 1]) for i in range(len(st) - 1))
    if MARKS[ch] == "dot": k = min(range(len(glyph)), key=lambda i: L(glyph[i]))
    else: k = max(range(len(glyph)), key=lambda i: abs(glyph[i][-1][0] - glyph[i][0][0]) - abs(glyph[i][-1][1] - glyph[i][0][1]))
    mark = glyph[k]
    if MARKS[ch] == "cross": mark = mark if mark[0][0] <= mark[-1][0] else mark[::-1]   # crosses go left to right
    return [st for i, st in enumerate(glyph) if i != k], [mark]

def nearest_on(glyph, q):
    """Closest point to q on any stroke (projected onto segments): (stroke index, segment index, point)."""
    best = (1e9, 0, 0, q)
    for i, st in enumerate(glyph):
        for k in range(len(st) - 1):
            (ax, ay), (bx, by) = st[k], st[k + 1]
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / ((dx * dx + dy * dy) or 1)))
            p = (ax + t * dx, ay + t * dy)
            d = math.dist(p, q)
            if d < best[0]: best = (d, i, k, p)
    return best[1:]

def hand_order(ch, glyph):
    """Body strokes reordered so the pen starts exactly at the entry; returns (strokes, body count, entry, exit)."""
    body, marks = split_marks(ch, glyph)
    i, k, p = nearest_on(body, hint_point(body, ENTRY[ch]))
    p = [round(p[0], 4), round(p[1], 4)]
    st = body[i]
    if math.dist(p, st[0]) < 0.02: first = [st]
    elif math.dist(p, st[-1]) < 0.02: first = [st[::-1]]
    else:   # entry inside a stroke: start there, run to one end, then come back for the other part
        a, b = [p] + st[k + 1:], [p] + st[k::-1]
        first = [a, b] if len(a) >= len(b) else [b, a]
    rest = [s2 for j, s2 in enumerate(body) if j != i]
    order = first + rest
    _, _, x = nearest_on(order, hint_point(body, EXIT.get(ch, (1, "base"))))
    return order + marks, len(order), p, [round(x[0], 4), round(x[1], 4)]

body_count, join_at = {}, {}
for ch in ENTRY:
    if ch in out and out[ch]:
        out[ch], body_count[ch], ein, eout = hand_order(ch, out[ch])
        join_at[ch] = [ein, eout]

tt = TTFont(FONT); upm = tt["head"].unitsPerEm
asc, desc = tt["hhea"].ascent / upm, tt["hhea"].descent / upm
json.dump({"w": round(float(np.median(widths)) / S, 4), "asc": round(asc, 4), "desc": round(desc, 4), "glyphs": out,
           "body": body_count,    # lowercase: how many leading strokes are the body (the rest are dots/crosses)
           "join": join_at},      # lowercase: [entry, exit] points where cursive joins arrive and leave
          open("public/" + OUT, "w"), separators=(",", ":"))
print(OUT, "glyphs:", len(out), "nib(em):", round(float(np.median(widths)) / S, 4), "asc/desc:", round(asc, 4), round(desc, 4))
for ch in "aeBk%":
    print(ch, "strokes:", len(out[ch]), [len(s) for s in out[ch]])

# debug sheet: lowercase in writing order; green = where the pen comes in, red = where it leaves
sample = "abcdefghijklmnopqrstuvwxyz"
sheet = Image.new("RGB", (13 * 110, 2 * 200), "white")
dr = ImageDraw.Draw(sheet)
cols = ["#1c2a60", "#b3261e", "#2e7d32", "#8a6d00", "#7b3f8c", "#0e6e7c", "#555"]
for i, ch in enumerate(sample):
    ox, oy = (i % 13) * 110 + 20, (i // 13) * 200 + 140
    for lv in ("top", "mid", "base", "desc"):
        dr.line([(ox - 10, oy + LEVEL[lv] * 110), (ox + 90, oy + LEVEL[lv] * 110)], fill="#dde6ee")
    g = out[ch]
    for j, st in enumerate(g):
        pts = [(ox + x * 110, oy + y * 110) for x, y in st]
        if len(pts) > 1: dr.line(pts, fill=cols[j % len(cols)], width=3, joint="curve")
        dr.text((pts[0][0] + 4, pts[0][1] - 12), str(j + 1), fill=cols[j % len(cols)])
    e0, e1 = join_at[ch]
    for (x, y), c in (((e0), "#16a34a"), ((e1), "#dc2626")):
        X, Y = ox + x * 110, oy + y * 110
        dr.ellipse([X - 6, Y - 6, X + 6, Y + 6], outline=c, width=3)
    dr.text((ox, oy + 45), ch, fill="#000")
sheet.save("/tmp/strokes_debug.png")
