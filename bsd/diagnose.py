#!/usr/bin/env python3
"""
diagnose.py -- re-run the BSD check on a database range and report the curves
whose BSD quotient is not an integer, with enough detail to see why.

    python diagnose.py --sweep /path/to/ecdata --max-conductor 1000
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bsd  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sweep", required=True)
    ap.add_argument("--max-conductor", type=int, default=1000)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    c = bsd.BSDChecker()
    curves = []
    for cf in sorted(glob.glob(os.path.join(args.sweep, "allcurves", "allcurves.*"))):
        curves.extend(bsd.parse_allcurves(cf, max_conductor=args.max_conductor))
    curves.sort(key=lambda c_: c_["label"])
    if args.limit:
        curves = curves[: args.limit]

    bad = []
    for cu in curves:
        f = c.check(cu["coeffs"], cu["label"])
        if not f.ok_sha_integer:
            bad.append((cu, f))

    print(f"checked {len(curves)} curves, {len(bad)} with a non-integer BSD quotient\n")
    for cu, f in bad:
        p = c.p
        E = p.ellinit(cu["coeffs"])
        info = p.ellrank(E)
        gens = list(info[3]) if len(info) >= 4 else []
        try:
            sat = list(p.ellsaturation(E, p(gens), 200)) if gens else []
        except Exception as exc:
            sat = f"saturation failed: {exc}"
        print(f"--- {cu['label']}  coeffs={cu['coeffs']}")
        print(f"    Cremona rank={cu['rank']}  PARI ellrank={info}")
        print(f"    generators found : {gens}")
        print(f"    after saturation : {sat}")
        print(f"    regulator        : {f.mw.regulator!r}")
        print(f"    analytic rank    : {f.an.analytic_rank}  L^(r)(E,1) = {f.an.leading_coefficient!r}")
        print(f"    Omega            : {f.real_period!r}   Tamagawa {f.local.tamagawa_product}"
              f"   tors {f.mw.torsion_order}")
        print(f"    Sha predicted    : {f.sha_predicted!r}")
        # try harder: more effort
        for effort in (4, 6, 8):
            try:
                info2 = p.ellrank(E, effort)
                print(f"    ellrank(effort={effort}) -> {info2}")
            except Exception as exc:
                print(f"    ellrank(effort={effort}) ERR {exc}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
