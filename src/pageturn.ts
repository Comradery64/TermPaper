/**
 * Book page turn for the settings card. The right-hand strip of the sheet (one "page",
 * width w, hinged at x = W − w) is lifted by its top-right corner and flipped leftward over
 * the hinge; the card is printed on the back, so it lands upright on the left of the hinge
 * and the blank next page shows where the page was.
 *
 * Geometry, per frame: the corner C travels to its mirror C′ across the hinge along an arc.
 * The fold is the perpendicular bisector of C and the corner's current position P.
 *  - Part of the page on C's side of the fold has lifted: the next page shows there (.under).
 *  - That part, reflected across the fold, is the flap: the back of the page (the card).
 *    Back content lives in its final frame, so its transform is reflect(hinge) then
 *    reflect(fold): two reflections, i.e. a plain rotation (never mirrored text).
 */
type Pt = [number, number];

// debug: ?turn=slow plays the turn at 1/10 speed; ?turn=0.4 freezes it at that progress
const TURN = new URLSearchParams(location.search).get("turn");
const SLOW = TURN === "slow" ? 10 : 1;
const FREEZE = TURN && !isNaN(+TURN) ? +TURN : null;
const OPEN_MS = 760 * SLOW, CLOSE_MS = 560 * SLOW;

export function pageTurn(root: HTMLElement, card: HTMLElement) {
  const under = document.createElement("div");
  under.className = "turn-under";
  const shade = document.createElement("div");
  shade.className = "turn-shade";
  under.appendChild(shade);
  const flap = document.createElement("div");          // unclipped wrapper: carries the drop shadow
  flap.className = "turn-flap";
  root.append(under, flap);
  flap.appendChild(card);

  let W = 0, H = 0, w = 0, hinge = 0;
  const layout = () => {
    W = innerWidth; H = innerHeight;
    w = Math.min(560, Math.floor(W * 0.46));
    hinge = W - w;
    Object.assign(card.style, { left: "0px", top: "0px", width: `${w}px`, height: `${H}px` });
    // the next page is ruled like this one: borrow the sheet's live ruling
    const sheet = document.getElementById("sheet");
    if (sheet) for (const v of ["--rule", "--rule-offset", "--cover"]) under.style.setProperty(v, getComputedStyle(sheet).getPropertyValue(v));
  };

  /** Draw the turn at progress e ∈ [0, 1] (0 = flat, 1 = fully turned). */
  let cur = 0;
  const frame = (e: number) => {
    cur = e;
    const C: Pt = [W, 0];
    // the corner's path: over the hinge to its mirror, lifted (down the page) mid-turn
    const P: Pt = [W - 2 * w * e, H * 0.22 * Math.sin(Math.PI * e)];
    const dx = C[0] - P[0], dy = C[1] - P[1], len = Math.hypot(dx, dy);
    if (len < 0.5) { under.style.clipPath = card.style.clipPath = "polygon(0 0)"; return; }
    const n: Pt = [dx / len, dy / len];                       // fold normal, toward C
    const M: Pt = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
    const side = (p: Pt) => (p[0] - M[0]) * n[0] + (p[1] - M[1]) * n[1];
    // lifted region U = page ∩ {side ≥ 0}
    const U = clip([[hinge, 0], [W, 0], [W, H], [hinge, H]], side);
    const poly = (pts: Pt[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
    under.style.clipPath = poly(U.length ? U : [[0, 0]]);
    // shadow cast by the curl onto the next page, along the fold
    const ang = Math.atan2(n[1], n[0]) * 180 / Math.PI;
    Object.assign(shade.style, { left: `${M[0]}px`, top: `${M[1]}px`, transform: `rotate(${ang - 90}deg) translateX(-50%)` });   // long axis along the fold, gradient toward the lifted side
    // back of the page: local (card) coords → final page coords → reflect hinge → reflect fold
    const F = (q: Pt): Pt => {
      const x = 2 * hinge - (q[0] + hinge - w), y = q[1];      // into the page, mirrored over the hinge
      const s = (x - M[0]) * n[0] + (y - M[1]) * n[1];
      return [x - 2 * s * n[0], y - 2 * s * n[1]];
    };
    const o = F([0, 0]), a = F([1, 0]), b = F([0, 1]);
    card.style.transform = `matrix(${a[0] - o[0]},${a[1] - o[1]},${b[0] - o[0]},${b[1] - o[1]},${o[0]},${o[1]})`;
    // flap shape in card coords: the lifted region taken back through the hinge mirror
    card.style.clipPath = poly(U.length ? U.map(([x, y]) => [2 * hinge - x - (hinge - w), y] as Pt) : [[0, 0]]);
  };

  const run = (from: number, to: number, ms: number) => new Promise<void>((done) => {
    if (FREEZE !== null) { frame(FREEZE); return; }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { frame(to); return done(); }
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      frame(from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });

  layout();
  frame(0);
  const onResize = () => { layout(); frame(cur); };
  addEventListener("resize", onResize);
  return {
    open: () => run(0, 1, OPEN_MS),
    close: () => { removeEventListener("resize", onResize); return run(1, 0, CLOSE_MS); },
  };
}

/** Sutherland–Hodgman: keep the part of a convex polygon where side(p) ≥ 0. */
function clip(poly: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
