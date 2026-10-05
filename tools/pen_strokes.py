"""Derive handwriting strokes for Monaspace Radon glyphs.

For each printable ASCII glyph: rasterize, skeletonize to a centerline, split
the skeleton into segments at junctions, chain segments into pen strokes
(continue through a junction along the straightest path), order strokes the
way a hand would (top-left first), and emit em-relative polylines.

Output: public/pen-strokes.json  { "w": nib width (em), "glyphs": { "a": [[[x,y],...], ...] } }
Run: /tmp/texenv/bin/python tools/pen_strokes.py
"""
import json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.morphology import skeletonize

FONT = "Monaspace Radon/monaspace-radon-latin-400-normal.ttf"
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

def chain(segs):
    """Join segments into strokes, continuing through junctions along the straightest path."""
    strokes, used = [], [False] * len(segs)
    near = 0.8 * 0.0854 * S   # junction ends within one nib width count as the same junction
    def ends_at(p, i):
        return [(j, k) for j, s in enumerate(segs) if not used[j] and j != i for k in (0, -1) if math.dist(s[k], p) <= near]
    for i in sorted(range(len(segs)), key=lambda i: (segs[i][0][1] + segs[i][0][0])):  # top-left-ish first
        if used[i]: continue
        used[i] = True
        s = list(segs[i])
        # orient: start at the end that is more top-left
        if (s[-1][0] + s[-1][1]) < (s[0][0] + s[0][1]): s.reverse()
        while True:
            cands = ends_at(s[-1], i)
            if not cands: break
            out = -direction(s, at_start=False)        # incoming direction at the junction
            best = max(cands, key=lambda jk: float(np.dot(-out, direction(segs[jk[0]] if jk[1] == 0 else segs[jk[0]][::-1], True))))
            j, k = best
            nxt = segs[j] if k == 0 else segs[j][::-1]
            if float(np.dot(-out, direction(nxt, True))) < 0.2: break   # too sharp: a new stroke
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

out, widths = {}, []
for code in range(0x21, 0x7f):
    ch = chr(code)
    mask = raster(ch)
    if not mask.any(): continue
    sk = skeletonize(mask)
    dist = ndimage.distance_transform_edt(mask)
    widths.append(float(np.median(dist[sk]) * 2))
    strokes = chain(segments(sk))
    strokes.sort(key=lambda s: (min(p[1] for p in s) * 0.6 + min(p[0] for p in s)))  # left, then top
    glyph = []
    for s in strokes:
        pts = simplify([(int(r), int(c)) for r, c in s])
        glyph.append([[round((c - PAD) / S, 4), round((r - PAD - S) / S, 4)] for r, c in pts])  # em units, y down from baseline
    out[ch] = glyph

json.dump({"w": round(float(np.median(widths)) / S, 4), "glyphs": out}, open("public/pen-strokes.json", "w"), separators=(",", ":"))
print("glyphs:", len(out), "nib(em):", round(float(np.median(widths)) / S, 4), "bytes:", __import__("os").path.getsize("public/pen-strokes.json"))
for ch in "aeBk%":
    print(ch, "strokes:", len(out[ch]), [len(s) for s in out[ch]])

# debug sheet: strokes colored in order, start of each stroke marked
sample = "aeBk%g@&Rsw3"
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
