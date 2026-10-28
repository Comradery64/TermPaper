/**
 * Hand-drawn cursive joins for letter pairs, per cursive font. pen.ts uses these instead of its
 * generic join for the pairs listed; tools/joinlab.html draws every pair large to edit them.
 *
 * Which join a pair takes follows Penpals for Handwriting (Cambridge University Press, 2003,
 * "Joining letter sets for Y4/P5"). The four joins as taught by Oak National Academy
 * ("The four joins" lessons, Year 2–3):
 *   1. baseline → x-height line (diagonal, no ascender: i→o, t→o "to")
 *   2. baseline → ascender line (diagonal to ascender: c→h "ch", i→t "it"; into t it reaches
 *      halfway between the x-height and ascender lines, where t starts)
 *   3. x-height → x-height line (horizontal, from o r v w: "oo"); it dips just below the
 *      x-height line and comes back up
 *   4. x-height → ascender line (horizontal to ascender: o→l "ol", r→t "rt")
 * Into anticlockwise letters (a c d g o q s) the join arrives at the letter's starting point on
 * the x-height line and the letter is formed from there. o leads out at the x-height line,
 * s t i h on the baseline. The cross of t and dot of i are not joined.
 *
 * Paths are SVG path data in em, y down from the baseline, x from the left of the first
 * letter's cell (the second letter's cell starts one advance to the right). Each path starts
 * where the first letter's last body stroke ends and ends where the second letter's first
 * stroke starts, so the pen runs on without a gap.
 */
export const PAIR_JOINS: Record<string, Record<string, string>> = {
  // Victor Mono italic, advance 0.5455 em; x-height 0.56, ascender 0.70
  "/pen-victor-cursive.json": {
    ss: "M.45 -.105C.56 -.12 .54 -.20 .6355 -.30", st: "M.45 -.105C.56 -.12 .758 -.3675 .7855 -.485L.8055 -.55 .8305 -.705", si: "M.45 -.105C.56 -.12 .73 -.33 .7955 -.485", so: "M.45 -.105C.56 -.12 .56 -.36 .7155 -.45C.7555 -.4825 .80 -.528 .8555 -.54", sh: "M.45 -.105C.56 -.12 .6465 -.307 .6705 -.385L.6805 -.49 .7255 -.705",
    ts: "M.395 -.065C.52 -.07 .54 -.20 .6355 -.30", tt: "M.395 -.065C.52 -.07 .758 -.3675 .7855 -.485L.8055 -.55 .8305 -.705", ti: "M.395 -.065C.52 -.07 .73 -.33 .7955 -.485", to: "M.395 -.065C.52 -.07 .56 -.36 .7155 -.45C.7555 -.4825 .80 -.528 .8555 -.54", th: "M.395 -.065C.52 -.07 .6465 -.307 .6705 -.385L.6805 -.49 .7255 -.705",
    is: "M.39 -.055C.52 -.06 .54 -.20 .6355 -.30", it: "M.39 -.055C.52 -.06 .758 -.3675 .7855 -.485L.8055 -.55 .8305 -.705", ii: "M.39 -.055C.52 -.06 .73 -.33 .7955 -.485", io: "M.39 -.055C.52 -.06 .56 -.36 .7155 -.45C.7555 -.4825 .80 -.528 .8555 -.54", ih: "M.39 -.055C.52 -.06 .6465 -.307 .6705 -.385L.6805 -.49 .7255 -.705",
    os: "M.31 -.54C.47 -.50 .54 -.31 .6355 -.30", ot: "M.31 -.54C.50 -.50 .79 -.49 .7993 -.53L.8055 -.55 .8305 -.705", oi: "M.31 -.54C.50 -.48 .65 -.43 .7955 -.485", oo: "M.31 -.54C.50 -.48 .66 -.46 .7155 -.45C.76 -.49 .80 -.528 .8555 -.54", oh: "M.31 -.54C.48 -.50 .68 -.49 .6905 -.54L.7255 -.705",
    hs: "M.47 -.035C.57 -.05 .54 -.20 .6355 -.30", ht: "M.47 -.035C.57 -.05 .758 -.3675 .7855 -.485L.8055 -.55 .8305 -.705", hi: "M.47 -.035C.57 -.05 .73 -.33 .7955 -.485", ho: "M.47 -.035C.57 -.05 .56 -.36 .7155 -.45C.7555 -.4825 .80 -.528 .8555 -.54", hh: "M.47 -.035C.57 -.05 .6465 -.307 .6705 -.385L.6805 -.49 .7255 -.705",
  },
  // Maple Mono italic, advance 0.6 em; x-height 0.535, ascender 0.69. Its s ends at the bottom
  // left of the bowl: joins from s first run back under the bowl (the pen retraces it)
  "/pen-maple-cursive.json": {
    ss: "M.085 -.09C.15 -.035 .28 -.03 .36 -.06C.44 -.08 .70 -.33 .76 -.47C.80 -.53 .95 -.535 1.03 -.48", st: "M.085 -.09C.15 -.035 .28 -.03 .36 -.06C.44 -.08 .82 -.2875 .84 -.38L.87 -.495 .87 -.545 .89 -.65", si: "M.085 -.09C.15 -.035 .28 -.03 .36 -.06C.44 -.08 .80 -.33 .87 -.48", so: "M.085 -.09C.15 -.035 .28 -.03 .36 -.06C.44 -.08 .64 -.40 .785 -.475C.815 -.4905 .85 -.512 .9 -.515", sh: "M.085 -.09C.15 -.035 .28 -.03 .36 -.06C.44 -.08 .7055 -.29 .725 -.395L.745 -.44 .745 -.51 .775 -.675",
    ts: "M.385 -.085C.50 -.09 .70 -.33 .76 -.47C.80 -.53 .95 -.535 1.03 -.48", tt: "M.385 -.085C.50 -.09 .82 -.2875 .84 -.38L.87 -.495 .87 -.545 .89 -.65", ti: "M.385 -.085C.50 -.09 .80 -.33 .87 -.48", to: "M.385 -.085C.50 -.09 .64 -.40 .785 -.475C.815 -.4905 .85 -.512 .9 -.515", th: "M.385 -.085C.50 -.09 .7055 -.29 .725 -.395L.745 -.44 .745 -.51 .775 -.675",
    is: "M.41 -.07C.52 -.07 .70 -.33 .76 -.47C.80 -.53 .95 -.535 1.03 -.48", it: "M.41 -.07C.52 -.07 .82 -.2875 .84 -.38L.87 -.495 .87 -.545 .89 -.65", ii: "M.41 -.07C.52 -.07 .80 -.33 .87 -.48", io: "M.41 -.07C.52 -.07 .64 -.40 .785 -.475C.815 -.4905 .85 -.512 .9 -.515", ih: "M.41 -.07C.52 -.07 .7055 -.29 .725 -.395L.745 -.44 .745 -.51 .775 -.675",
    os: "M.3 -.515C.50 -.47 .70 -.53 .85 -.525C.95 -.522 1.0 -.51 1.03 -.48", ot: "M.3 -.515C.50 -.48 .86 -.47 .87 -.51L.87 -.545 .89 -.65", oi: "M.3 -.515C.50 -.46 .72 -.42 .87 -.48", oo: "M.3 -.515C.45 -.47 .70 -.44 .785 -.475C.815 -.495 .85 -.512 .9 -.515", oh: "M.3 -.515C.48 -.48 .74 -.47 .745 -.51L.775 -.675",
    hs: "M.39 -.065C.50 -.07 .70 -.33 .76 -.47C.80 -.53 .95 -.535 1.03 -.48", ht: "M.39 -.065C.50 -.07 .82 -.2875 .84 -.38L.87 -.495 .87 -.545 .89 -.65", hi: "M.39 -.065C.50 -.07 .80 -.33 .87 -.48", ho: "M.39 -.065C.50 -.07 .64 -.40 .785 -.475C.815 -.4905 .85 -.512 .9 -.515", hh: "M.39 -.065C.50 -.07 .7055 -.29 .725 -.395L.745 -.44 .745 -.51 .775 -.675",
  },
};
