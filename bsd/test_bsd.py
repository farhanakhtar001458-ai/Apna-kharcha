#!/usr/bin/env python3
"""
test_bsd.py -- self-contained regression tests for bsd.py.

Run with:   ../.venv-bsd/bin/python test_bsd.py
(or with pytest, if available)

The expected values are taken from Cremona's database (github.com/JohnCremona/ecdata)
and from the classical literature; the point of the tests is to catch convention
changes (real period factor, regulator convention, Tamagawa product, ...).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bsd  # noqa: E402

FAILURES = []


def check(name, got, want, tol=1e-9):
    if isinstance(got, (int, float)) and isinstance(want, (int, float)) \
            and not isinstance(got, bool) and not isinstance(want, bool):
        if isinstance(got, int) and isinstance(want, int):
            ok = got == want
        else:
            # relative tolerance (plus a tiny absolute floor for values ~ 0)
            ok = abs(got - want) <= tol * abs(want) + 1e-15
    else:
        ok = got == want
    status = "ok  " if ok else "FAIL"
    if not ok:
        FAILURES.append(f"{name}: got {got!r}, want {want!r}")
    print(f"[{status}] {name}: {got!r}")


def main() -> int:
    c = bsd.BSDChecker()

    # ---- the curve from the reel -------------------------------------------
    f = c.check([0, 0, 0, -1, 1], "92b1")
    check("92b1 conductor", f.local.conductor, 92)
    check("92b1 root number", f.local.root_number, -1)
    check("92b1 Tamagawa product", f.local.tamagawa_product, 3)
    check("92b1 c_2", f.local.tamagawa_by_prime.get(2), 3)
    check("92b1 c_23", f.local.tamagawa_by_prime.get(23), 1)
    check("92b1 torsion order", f.mw.torsion_order, 1)
    check("92b1 algebraic rank", f.mw.rank, 1)
    check("92b1 analytic rank", f.an.analytic_rank, 1)
    check("92b1 real period", f.real_period, 4.707087761230185, tol=1e-12)
    check("92b1 regulator", f.mw.regulator, 0.0498083972980648, tol=1e-10)
    check("92b1 L'(E,1)", f.an.leading_coefficient,
          0.70335749198463476514333271025955116004, tol=1e-12)
    check("92b1 #Sha predicted", f.sha_predicted, 1.0, tol=1e-9)
    check("92b1 all checks", f.all_ok, True)

    # independent quadrature for the real period
    check("92b1 Omega (quadrature)", c.real_period_numeric([0, 0, 0, -1, 1]),
          4.707087761230185, tol=1e-7)

    # ---- classical examples -------------------------------------------------
    f11 = c.check([0, -1, 1, -10, -20], "11a1")
    check("11a1 real period", f11.real_period, 1.2692093042795534, tol=1e-12)
    check("11a1 L(E,1)", f11.an.leading_coefficient, 0.25384186085591068, tol=1e-12)
    check("11a1 #Sha", f11.sha_predicted, 1.0, tol=1e-9)

    f37 = c.check([0, 0, 1, -1, 0], "37a1")
    check("37a1 real period", f37.real_period, 5.986917292463919, tol=1e-12)
    check("37a1 L'(E,1)", f37.an.leading_coefficient,
          0.30599977383405230, tol=1e-12)
    check("37a1 regulator", f37.mw.regulator, 0.0511114082399688, tol=1e-9)
    check("37a1 #Sha", f37.sha_predicted, 1.0, tol=1e-9)

    # the first curve with a non-trivial Tate-Shafarevich group
    f571 = c.check([0, -1, 1, -929, -10595], "571a1")
    check("571a1 #Sha", f571.sha_predicted, 4.0, tol=1e-9)
    check("571a1 #Sha is a square", f571.ok_sha_square, True)
    check("571a1 2-descent bound", f571.mw.sha2_dim, 2)

    # larger Sha
    f681 = c.check([1, 1, 0, -1154, -15345], "681b1")
    check("681b1 #Sha", f681.sha_predicted, 9.0, tol=1e-9)
    f210 = c.check([1, 0, 0, -1920800, -1024800150], "210e7")
    check("210e7 #Sha", f210.sha_predicted, 16.0, tol=1e-9)

    # rank 2 and rank 3
    f389 = c.check([0, 1, 1, -2, 0], "389a1")
    check("389a1 ranks", (f389.mw.rank, f389.an.analytic_rank), (2, 2))
    check("389a1 #Sha", f389.sha_predicted, 1.0, tol=1e-9)
    f5077 = c.check([0, 0, 1, -7, 6], "5077a1")
    check("5077a1 ranks", (f5077.mw.rank, f5077.an.analytic_rank), (3, 3))
    check("5077a1 #Sha", f5077.sha_predicted, 1.0, tol=1e-9)

    # ---- the p-adic (Iwasawa) analogue --------------------------------------
    r, lp = c.padic_bsd([0, 0, 0, -1, 1], 23, 5)
    check("92b1 p-adic BSD rank at p=23 (rank+1: split multiplicative)", r, 2)

    # ---- the Tamagawa convention -------------------------------------------
    # ellglobalred()[2] is the *finite* product; PARI's elltamagawa() also
    # multiplies in the factor 2 at infinity when disc > 0.
    E = c.p.ellinit([0, -1, 1, -10, -20])          # 11a1: disc < 0
    check("11a1 elltamagawa == finite product",
          int(c.p.elltamagawa(E)), int(c.p.ellglobalred(E)[2]))
    E = c.p.ellinit([0, 0, 1, -1, 0])              # 37a1: disc > 0
    check("37a1 elltamagawa is 2x the finite product",
          int(c.p.elltamagawa(E)), 2 * int(c.p.ellglobalred(E)[2]))

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURES:")
        for f_ in FAILURES:
            print("  -", f_)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
