# `bsd/` — a verification harness for the Birch and Swinnerton-Dyer conjecture

This directory answers the question posed by the screenshot in the task: *"solve the
Birch and Swinnerton-Dyer conjecture"*.

**Short answer: it is an open Clay Millennium Prize Problem and it is not solved.**
What is here instead:

| file | what it is |
|---|---|
| [`BSD_REPORT.md`](BSD_REPORT.md) | the main document: precise statement of BSD, the curve from the reel (Cremona 92b1) worked out in full, the current state of the art, the exact open gap, and what a proof would have to contain |
| `bsd.py` | the checker: local data, Mordell–Weil group + saturated regulator, the Taylor coefficients of `L(E,s)` at `s = 1`, the BSD quotient `S = L^(r)(E,1)/(r!·Ω_E·R_E·∏c_p/#tors²)`, and the tests "`S` is a positive integer", "`S` is a perfect square", "`S` fits the 2-descent bound" |
| `verify.py` | driver: runs the curated set and, with `--sweep`, checks every curve in Cremona's database up to a conductor bound |
| `test_bsd.py` | regression tests that pin the computed values of the classic curves (run: `python test_bsd.py`) |
| `diagnose.py` | re-runs the check on a database range and explains any curve whose BSD quotient is not an integer |
| `results_sweep_10k.md` | output of the sweep over conductor ≤ 10 000 |
| `sweep_anomalies.txt` | list of curves (if any) that failed the sweep |

## Requirements

```sh
python3 -m venv .venv-bsd
.venv-bsd/bin/pip install cypari2==2.2.0 mpmath
```

`cypari2` ships PARI/GP 2.15.4 (wheels exist for CPython 3.11); `mpmath` is used only
for the independent numerical computation of the real period.

## Running

```sh
cd bsd
../.venv-bsd/bin/python verify.py

# sweep over Cremona's database
git clone --depth 1 --filter=blob:none --sparse https://github.com/JohnCremona/ecdata.git
cd ecdata && git sparse-checkout set allcurves allbsd allgens && cd ..
../.venv-bsd/bin/python verify.py --sweep ../ecdata --max-conductor 10000 --out results_sweep_10k.md
```

## Conventions used (and the ones that bite)

* `Ω_E = ∫_{E(ℝ)} |dx/(2y + a₁x + a₃)|` — the real period in the BSD/Cremona/LMFDB
  convention. The harness recomputes it by quadrature to confirm the convention.
* The regulator is the determinant of `⟨P,Q⟩ = ½(ĥ(P+Q) − ĥ(P) − ĥ(Q))`, i.e. PARI's
  (`ellheightmatrix`) convention, in which a rank-1 regulator is simply `ĥ(P)`.
* Tamagawa numbers come from `ellglobalred(E)[2]` (the **finite** product). PARI's
  `elltamagawa(E)` also multiplies in the archimedean factor `2` when `Δ > 0`, which is
  not what BSD uses — using it breaks half of the database.
* Mordell–Weil generators returned by a descent are **not** saturated (for 92b1 the
  returned point is `−3G` for the true generator `G = (1,1)`), so the regulator is
  computed after `ellsaturation`.
* The order of vanishing of `L(E,s)` at `s = 1` is read off PARI's `lfun` (38 digits),
  not `ellL1`, whose "zero" values are only accurate to ~10⁻¹⁹.
* PARI's descent sometimes returns the right rank but **no points** (when the
  generators are astronomically large, e.g. `1369b2`); the harness retries with
  `ellrank(E, 4)` / `ellrank(E, 6)` and, as a last resort, takes the generators from
  Cremona's `allgens` file. In that file the free generators are listed **before** the
  torsion generators, and a torsion point has Néron–Tate height 0, so it has to be
  filtered out before the height matrix is formed.
* `S = L^(r)(E,1)/(r!·Ω_E·R_E·∏c_p/#tors²)` is compared with the *detected* 2-Selmer
  dimension as `dim Sha[2]_detected ≤ v₂(S)`. PARI's descent is not always sharp, so
  the detected dimension is a lower bound and the test is one-sided.

## What this does *not* do

It does not prove BSD, and it cannot: the conjecture is open. Numerical verification on
thousands of curves is evidence, not proof — the same caveat that appears in every
serious write-up of BSD.
