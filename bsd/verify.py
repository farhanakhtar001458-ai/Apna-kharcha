#!/usr/bin/env python3
"""
verify.py -- run the BSD checks of bsd.py and print a report.

Usage
-----
    python verify.py                      # curated set of curves
    python verify.py --sweep /path/to/ecdata --max-conductor 1000
    python verify.py --out results.md     # write a markdown report

The sweep needs John Cremona's database (github.com/JohnCremona/ecdata); see
the README for the one-line clone command.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bsd  # noqa: E402

# --------------------------------------------------------------------------
# the curated set: label, Weierstrass coefficients, comment
# --------------------------------------------------------------------------

CURATED = [
    ("92b1", [0, 0, 0, -1, 1], "the curve in the reel: y^2 = x^3 - x + 1"),
    ("11a1", [0, -1, 1, -10, -20], "smallest conductor; rank 0, tors Z/5"),
    ("14a1", [1, 0, 1, 4, -6], "rank 0, tors Z/6"),
    ("15a1", [1, 1, 1, -10, -10], "rank 0, tors Z/4 x Z/2"),
    ("37a1", [0, 0, 1, -1, 0], "first rank-1 curve"),
    ("43a1", [0, 1, 1, 0, 0], "rank 1"),
    ("57a1", [0, -1, 1, -2, 2], "rank 1"),
    ("65a1", [1, 0, 0, -1, 0], "rank 1, tors Z/2"),
    ("91b1", [0, 1, 1, -7, 5], "rank 1, tors Z/3"),
    ("117a1", [1, -1, 1, 4, 6], "rank 1, tors Z/4"),
    ("234a1", [1, -1, 0, -24, -64], "rank 0"),
    ("389a1", [0, 1, 1, -2, 0], "rank 2"),
    ("5077a1", [0, 0, 1, -7, 6], "rank 3"),
    ("66b3", [1, 1, 1, -352, -2689], "rank 0, #Sha = 4"),
    ("571a1", [0, -1, 1, -929, -10595], "rank 0, #Sha = 4"),
    ("681b1", [1, 1, 0, -1154, -15345], "rank 0, #Sha = 9"),
    ("210e7", [1, 0, 0, -1920800, -1024800150], "rank 0, #Sha = 16"),
]


def fmt(x, n=12):
    if isinstance(x, float):
        return f"{x:.{n}g}"
    return str(x)


def curated_report(checker: bsd.BSDChecker) -> tuple[str, list]:
    lines = [
        "| curve | N | w | rank (alg / an) | Omega_E | R | #Sha (predicted) | checks |",
        "|---|---|---|---|---|---|---|---|",
    ]
    facts = []
    for label, coeffs, comment in CURATED:
        try:
            f = checker.check(coeffs, label)
        except Exception as exc:  # pragma: no cover
            lines.append(f"| {label} | - | - | - | - | - | - | FAILED: {exc} |")
            continue
        facts.append(f)
        flags = []
        flags.append("rank ok" if f.ok_rank else "RANK MISMATCH")
        flags.append("int" if f.ok_sha_integer else "NOT INTEGER")
        flags.append("square" if f.ok_sha_square else "not square")
        if f.mw.sha2_dim:
            flags.append(f"2-part ok (<=2^{f.mw.sha2_dim})")
        lines.append(
            f"| {label} | {f.local.conductor} | {f.local.root_number:+d} | "
            f"{f.mw.rank} / {f.an.analytic_rank} | {fmt(f.real_period)} | "
            f"{fmt(f.mw.regulator)} | {fmt(f.sha_predicted, 10)} | {', '.join(flags)} |"
        )
    return "\n".join(lines), facts


def sweep(checker: bsd.BSDChecker, ecdata: str, max_conductor: int, limit: int | None):
    curves_file = sorted(glob.glob(os.path.join(ecdata, "allcurves", "allcurves.*")))
    bsd_file = sorted(glob.glob(os.path.join(ecdata, "allbsd", "allbsd.*")))
    if not curves_file:
        raise SystemExit(f"no allcurves files under {ecdata}/allcurves")
    curves = []
    for cf in curves_file:
        curves.extend(bsd.parse_allcurves(cf, max_conductor=max_conductor))
    curves.sort(key=lambda c: c["label"])
    if limit:
        curves = curves[:limit]

    bsd_ref = {}
    for bf in bsd_file:
        bsd_ref.update(bsd.parse_allbsd(bf, max_conductor=max_conductor))

    gens_ref = {}
    for gf in sorted(glob.glob(os.path.join(ecdata, "allgens", "allgens.*"))):
        gens_ref.update(bsd.parse_allgens(gf, max_conductor=max_conductor))

    def _point(triple):
        x, y, z = triple
        if z == 0:
            return None
        return checker.p([f"{x}/{z}", f"{y}/{z}"])

    n = len(curves)
    ok_rank = ok_int = ok_square = 0
    tam_mismatch = 0
    lval_mismatch = 0
    failures = []
    t0 = time.time()
    for i, c in enumerate(curves):
        if i and i % 500 == 0:
            print(f"  ... {i}/{len(curves)} curves, {time.time() - t0:.0f}s", flush=True)
        try:
            f = checker.check(c["coeffs"], c["label"])
            if f.mw.rank > 0 and not f.mw.generators and c["label"] in gens_ref:
                # PARI's descent cannot produce points for a few curves whose
                # generators are astronomically large; fall back to the
                # generators stored in Cremona's database.
                basis = [pt for pt in (_point(t) for t in gens_ref[c["label"]]) if pt]
                if basis:
                    f = checker.check(c["coeffs"], c["label"], basis=basis)
        except Exception as exc:
            failures.append((c["label"], f"exception: {exc}"))
            continue
        ok_rank += f.ok_rank
        ok_int += f.ok_sha_integer
        ok_square += f.ok_sha_square
        ref = bsd_ref.get(c["label"])
        if ref is not None:
            if ref["tamagawa"] != f.local.tamagawa_product:
                tam_mismatch += 1
                failures.append(
                    (c["label"], f"Tamagawa: PARI {f.local.tamagawa_product} vs Cremona {ref['tamagawa']}")
                )
            # compare the leading coefficient L^(r)(E,1)/r! with Cremona
            import math as _math
            lc = f.an.leading_coefficient / _math.factorial(f.an.analytic_rank)
            if abs(lc - ref["lvalue"]) > 1e-6 * max(1.0, abs(ref["lvalue"])):
                lval_mismatch += 1
                failures.append(
                    (c["label"], f"L-value: computed {lc!r} vs Cremona {ref['lvalue']!r}")
                )
        if not f.all_ok:
            failures.append((c["label"], "; ".join(f.notes) or "BSD check failed"))
    dt = time.time() - t0
    return {
        "n": n,
        "ok_rank": ok_rank,
        "ok_int": ok_int,
        "ok_square": ok_square,
        "tam_mismatch": tam_mismatch,
        "lval_mismatch": lval_mismatch,
        "failures": failures,
        "seconds": dt,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sweep", help="path to a checkout of JohnCremona/ecdata")
    ap.add_argument("--max-conductor", type=int, default=1000)
    ap.add_argument("--limit", type=int, default=None, help="only check the first N curves")
    ap.add_argument("--out", help="write the markdown report here")
    args = ap.parse_args()

    checker = bsd.BSDChecker()
    table, facts = curated_report(checker)
    print("### Curated set\n")
    print(table)
    print()

    summary = ""
    if args.sweep:
        res = sweep(checker, args.sweep, args.max_conductor, args.limit)
        print("### Sweep over Cremona's database\n")
        print(f"- curves checked: **{res['n']}** (conductor <= {args.max_conductor})")
        print(f"- rank(algebraic) == rank(analytic): **{res['ok_rank']}/{res['n']}**")
        print(f"- BSD quotient is an integer:      **{res['ok_int']}/{res['n']}**")
        print(f"- BSD quotient is a perfect square: **{res['ok_square']}/{res['n']}**")
        print(f"- Tamagawa product disagreements with Cremona: {res['tam_mismatch']}")
        print(f"- L-value disagreements with Cremona:          {res['lval_mismatch']}")
        print(f"- wall clock: {res['seconds']:.1f} s")
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               "sweep_anomalies.txt"), "w") as fh:
            for lbl, msg in res["failures"]:
                fh.write(f"{lbl}: {msg}\n")
        if res["failures"]:
            print(f"\nAnomalies ({len(res['failures'])}):")
            for lbl, msg in res["failures"][:40]:
                print(f"  - {lbl}: {msg}")
        summary = "\n".join(
            [
                f"curves checked: {res['n']}",
                f"rank equality: {res['ok_rank']}/{res['n']}",
                f"integer Sha: {res['ok_int']}/{res['n']}",
                f"square Sha: {res['ok_square']}/{res['n']}",
            ]
        )

    if args.out:
        with open(args.out, "w") as fh:
            fh.write("# BSD verification results\n\n")
            fh.write(table + "\n\n")
            if summary:
                fh.write("## Sweep\n\n```\n" + summary + "\n```\n")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
