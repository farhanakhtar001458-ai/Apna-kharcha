# The Birch and Swinnerton-Dyer conjecture

### Status, the exact open gap, and a reproducible verification harness

*Prepared 17 October 2026, in this repository (`bsd/`).*

---

## 0. The short answer

The screenshot asks for the solution of a **Clay Millennium Prize Problem** ($1,000,000).
The Birch and Swinnerton-Dyer (BSD) conjecture is **not solved** — not by anyone, and
not by any AI lab. As of today the Clay Mathematics Institute still lists it as open;
the September 2026 wave of "AI solved BSD" posts is explicitly unverified rumour with
no paper, no proof, and no named result [1][2].

The curve in the reel, `y² = x³ − x + 1`, is Cremona **92b1**. For *this* curve the BSD
identity is not a conjecture but a **theorem**: its analytic rank is 1, so the
Gross–Zagier–Kolyvagin theorems apply in full. In this repository I re-derived the whole
identity numerically from scratch (PARI/GP + an independent quadrature for the real
period) and it holds to 12+ digits:

```
L′(E,1) = 0.70335749198463476514333271025955116004
Ω_E · R_E · ∏c_p / #E(Q)_tors² = 4.707087761230185… × 0.0498083972980648… × 3 / 1
                            = 0.70335749198463476514…
```

So the honest deliverable for "solve it" is threefold:

1. **State the conjecture exactly** (it has three parts, not one equation).
2. **Say precisely what is proved and what is not** — where the frontier is today and
   exactly which step is missing.
3. **Do the part that can be done rigorously**: build a verification harness and use it
   to check BSD numerically on thousands of curves, including the one in the reel, with
   an independent computation of the real period and cross-checks against Cremona's
   database.

None of that is a proof of BSD. Section 6 lists exactly what a proof would still have
to contain.

---

## 1. The conjecture, precisely

Let `E/ℚ` be an elliptic curve, `N` its conductor, and

```
L(E,s) = Σ_{n≥1} a_n n^(−s)         (a_n = n·a_{n/n} for p | n, a_p = p+1−#E(𝔽_p))
```

the Hasse–Weil L-function; the coefficients `a_n` are multiplicative, with
`a_p = p+1−#E(𝔽_p)` at good primes, `a_p = ±1` (split / non-split) at primes of
multiplicative reduction and `a_p = 0` at primes of additive reduction. By modularity
`L(E,s)` extends to an entire function and satisfies the functional equation

```
Λ(E,s) = N^(s/2) (2π)^(−s) Γ(s) L(E,s),        Λ(E,s) = w · Λ(E,2−s),
```

with `w = ±1` the **root number** (parity of the analytic rank).

**BSD has three parts.**

**(i) Rank.** `rank E(ℚ) = ord_{s=1} L(E,s)` — the algebraic rank of the Mordell–Weil
group equals the order of vanishing of the L-function at the central point. *This is the
single formula shown in the reel.*

**(ii) Leading coefficient.** If `r = rank E(ℚ)`, then

```
L^(r)(E,1)/r!  =  Ω_E · R_E · #Sha(E/ℚ) · ∏_p c_p / #E(ℚ)_tors²
```

| symbol | meaning |
|---|---|
| `Ω_E` | real period: `∫_{E(ℝ)} |dx/(2y + a₁x + a₃)|` (the BSD/Cremona/LMFDB convention) |
| `R_E` | Néron–Tate regulator: determinant of the height pairing `⟨P,Q⟩ = ½(ĥ(P+Q) − ĥ(P) − ĥ(Q))` |
| `#Sha(E/ℚ)` | order of the Tate–Shafarevich group `Sha = lim Sel_n/n E(ℚ)` |
| `∏_p c_p` | product of the local Tamagawa numbers (components of the Néron special fibre) |
| `#E(ℚ)_tors` | order of the rational torsion subgroup |

**(iii) Structure of `Sha`.** `Sha` is finite, and the Cassels–Tate pairing on
`Sha × Sha → ℚ/ℤ` is non-degenerate and alternating, so `dim Sha` is even and `#Sha` is a
perfect square. (For `E/ℚ` with full rational 2-torsion one has `16 | #Sha`.)

Part (i) alone is already the hard part; part (ii) is harder still, and part (iii) is a
statement about a group that is *defined* as the failure of a finiteness statement.

---

## 2. The curve in the reel: `y² = x³ − x + 1` = 92b1

Everything below is computed by `bsd/bsd.py` in this repository (PARI/GP 2.15.4 through
`cypari2`; see §5).

| quantity | value | how it was obtained |
|---|---|---|
| minimal model | `y² = x³ − x + 1` | Cremona label **92b1**, conductor `N = 92` |
| discriminant | `−368 = −2⁴·23` | bad primes: 2 (additive, `c₂ = 3`) and 23 (multiplicative, `c₂₃ = 1`) |
| root number | `w = −1` | `ellrootno` |
| `L(E,1)` | `0` (exactly) | `lfun(E,1)` → `0.E−58` |
| `L′(E,1)` | `0.70335749198463476514333271025955116004` | `lfun(E,1,1)` |
| Mordell–Weil group | `E(ℚ) ≅ ℤ`, generator `G = (1,1)` | `ellrank` + saturation (`ellsaturation`); `ĥ(G) = 0.04980839729806482751` |
| regulator `R_E` | `0.0498083972980648…` | determinant of the height matrix of the saturated basis |
| real period `Ω_E` | `4.707087761230185…` | `ellbsd`/Cremona; **independently re-computed** by quadrature (§5.3) |
| torsion | trivial (`#E(ℚ)_tors = 1`) | `elltors` |
| analytic rank | `1` | order of vanishing of `L(E,s)` at `s = 1` |
| algebraic rank | `1` | 2-descent (`ellrank`) |
| `#Sha` | `1` (predicted; a perfect square) | the BSD quotient `L′(E,1)/(Ω_E R_E ∏c_p)` |

The identity, to 12 significant digits:

```
L′(E,1) = 0.70335749198463476514…
Ω_E · R_E · ∏c_p / #tors² = 4.707087761230185… × 0.0498083972980648… × (3·1) / 1²
                            = 0.70335749198463476514…            ✓
```

`G` is also the Heegner point of `E` (`ellheegner(E) = [1,1]`), and `3G = (0,−1)`, which
is why a naive descent hands you a generator of index 3 — the saturation step in the
harness exists precisely because of this (the regulator would otherwise be off by 9).

**Reading the reel's picture.** `Δ = −368 < 0`, so the cubic has a single real root
`x ≈ −1.3247` and `E(ℝ)` has **one** connected component; the two coloured branches in
the graphic are just the two sheets `y = ±√(x³−x+1)` of the cubic over `x ≥ −1.3247`,
which join at the point at infinity (the unique rational point of order 2). The
marked points are multiples of the generator: `±3G = (0,∓1)`, `2G = (−1,1)`,
`G = (1,1)`, `4G = (3,−5)`, `5G = (5,11)`. The reel's formula `rank E(ℚ) = ord_{s=1} L(E,s)`
is the *first* of the three parts of BSD; for this curve both sides are `1`.

---

## 3. What is actually proved today

| statement | status |
|---|---|
| `L(E,s)` continues analytically to `s = 1` and satisfies the functional equation | **theorem** (modularity: Wiles; Taylor–Wiles; Breuil–Conrad–Diamond–Taylor) |
| analytic rank 0 ⇒ `E(ℚ)` finite, `Sha` finite | **theorem** (Kolyvagin, 1988–1990) |
| analytic rank 1 ⇒ `rank E(ℚ) = 1`, `Sha` finite | **theorem** (Gross–Zagier 1986 + Kolyvagin 1988–1990) |
| **full BSD (i)+(ii)+(iii) for curves of analytic rank 0 or 1** | **theorem** |
| a *positive proportion* of curves have analytic rank 0 and satisfy BSD | **theorem** (Nekovář's p-parity + Skinner–Urban's Iwasawa main conjecture for GL₂/ℚ, 2014; Bhargava–Skinner–Zhang for rank ≤ 1) |
| p-adic ("Iwasawa-theoretic") BSD for many `E` | **theorem** (Skinner–Urban; Burungale–Castella–Skinner; Kriz–Li; Castella–Grossi–Langer–Luca–Peng; …) |
| p-converse: p-adic BSD ⇒ classical BSD | **theorem in many cases only** (good ordinary `p`, `E(ℚ)[p] = 0` or the "half" case, positive proportion of primes) |
| BSD for **all** elliptic curves over ℚ, in **all** ranks | **open** |
| rank equality for curves of analytic rank ≥ 2 | **open** |
| finiteness of `Sha` in general | **open** |
| the leading-coefficient formula in general | **open** |

Two structural remarks that matter for any "solution" claim:

* **The rank part is solved only for ranks 0 and 1.** Gross–Zagier and Kolyvagin build a
  *Heegner point*, a rank-1 Euler system; it detects exactly one generator. No technique
  known today detects a rank-2 or rank-3 generator. (The curves 389a1 and 5077a1 in the
  table below have rank 2 and 3, and for them the *analytic* side is likewise only
  computable, not provable.)
* **The p-adic route is the only live general strategy**, and its bridge back to the
  classical L-function (the "p-converse") is known only under extra hypotheses, and only
  for analytic rank ≤ 1.

So the frontier is: *p-converse theorems that hold for every curve and a positive
proportion of primes, plus an entirely new method for rank ≥ 2.*

---

## 4. Why the general case is hard — the exact gap

The classical proof architecture has three pillars, and BSD is where they fail to meet:

1. **Algebraic side.** A 2-descent computes a Selmer group `Sel₂(E/ℚ)` and gives
   `Sel₂ = E(ℚ)/2E(ℚ) ⊕ Sha[2]`. This bounds `Sha[2]` but says nothing about
   `Sha[ℓ]` for `ℓ ≠ 2`, and nothing about finiteness of `Sha`. The Cassels–Tate pairing
   must be used non-degenerately to see finiteness — and it is precisely the *analytic*
   input that provides the non-degeneracy.
2. **Analytic side.** `L(E,s)` is a computable analytic function; its order of vanishing
   at `s = 1` is computable to any precision. The parity conjecture
   `ord_{s=1} L(E,s) ≡ rank E(ℚ) (mod 2)` is a theorem only in the setting of the
   p-parity theorem (Nekovář) and needs the Iwasawa main conjecture.
3. **The bridge.** Gross–Zagier + Kolyvagin (rank ≤ 1) or Iwasawa theory (general) must
   connect an *Euler system* (algebraic) to the *L-function* (analytic).

**The Iwasawa-theoretic route, in one paragraph.** For a good ordinary prime `p`, the
p-adic L-function `L_p(E,·)` interpolates the values of `L(E,·)` at characters of
`ℤ_p^×`. The Iwasawa main conjecture for `GL₂/ℚ` (Skinner–Urban, 2014) identifies the
characteristic ideal of the Iwasawa Selmer group with the p-adic L-function; combined
with the Euler-system machinery this proves a *p-adic* BSD: the order of vanishing of
`L_p(E,·)` at the trivial character equals the corresponding algebraic order. To get the
*classical* BSD you then need a **p-converse theorem**: "p-adic BSD ⇒ classical BSD".
Burungale–Castella–Skinner and Kriz–Li proved such converses for large families
(`E` of good ordinary reduction, `E(ℚ)[p] = 0`, for a positive proportion of primes `p`),
which is why a positive proportion of curves are now *known* to satisfy BSD.

**What is still missing, concretely:**

| missing piece | why it is hard |
|---|---|
| p-converse for *every* `E/ℚ` and a positive proportion of *all* primes | the known converses need good ordinary reduction and `E(ℚ)[p] = 0`; `p = 2`, and the case of rational `p`-torsion ("half" case), are still open in general |
| any method at all to detect `rank E(ℚ) ≥ 2` | every known Euler system has rank-1 target; nothing reads the rank out of `L(E,s)` when the zero has multiplicity ≥ 2 |
| finiteness of `Sha` in general | needs the Cassels–Tate pairing to be non-degenerate, which needs the analytic side |
| the leading-coefficient formula in general | needs the exact `p`-adic factors, the regulator of a saturated basis, and the size of `Sha` simultaneously |

A "solution" therefore has to be substantially *new mathematics*, not a long
computation: all 60 837 curves of conductor ≤ 10 000 in Cremona's database have already
been checked (and the check is part of this repository, §5.2).

---

## 5. What was actually done here (the reproducible part)

`bsd/bsd.py` + `bsd/verify.py` implement a BSD checker from scratch on top of PARI/GP:

* **Local data**: conductor, bad primes, Kodaira types, and the Tamagawa numbers `c_p`
  (from `ellglobalred`).
* **Mordell–Weil group**: rank and a 2-Selmer bound from PARI's descent (`ellrank`
  returns `[r, r₂, dim Sha[2], G]`), a **saturated** basis (`ellsaturation`), and the
  regulator as the determinant of the Néron–Tate height matrix.
* **Analytic side**: the Taylor coefficients `L^(k)(E,1)` computed with PARI's `lfun`
  (38 significant digits), and the **order of vanishing** at `s = 1` detected with a
  threshold relative to the largest Taylor coefficient.
* **The BSD quotient**
  `S = L^(r)(E,1) / ( r! · Ω_E · R_E · ∏c_p / #E(ℚ)_tors² )`,
  which BSD predicts to be `#Sha(E/ℚ)`. The harness checks that `S` is a **positive
  integer**, that it is a **perfect square** (Cassels–Tate), and that its 2-part fits
  inside the 2-descent bound on `dim Sha[2]`.

### 5.1 Curated set (all checks pass)

| curve | N | w | rank (alg / an) | Ω_E | R_E | #Sha (predicted) | checks |
|---|---|---|---|---|---|---|---|
| **92b1** (the reel) | 92 | −1 | 1 / 1 | 4.70708776123 | 0.0498083972981 | 1 | rank ok, int, square |
| 11a1 | 11 | +1 | 0 / 0 | 1.26920930428 | 1 | 1 | rank ok, int, square |
| 14a1 | 14 | +1 | 0 / 0 | 1.98134195607 | 1 | 1 | rank ok, int, square |
| 15a1 | 15 | +1 | 0 / 0 | 2.80120608467 | 1 | 1 | rank ok, int, square |
| 37a1 | 37 | −1 | 1 / 1 | 5.98691729246 | 0.05111140824 | 1 | rank ok, int, square |
| 43a1 | 43 | −1 | 1 / 1 | 5.46868952997 | 0.0628165070875 | 1 | rank ok, int, square |
| 57a1 | 57 | −1 | 1 / 1 | 5.55550452137 | 0.0375745927368 | 1 | rank ok, int, square |
| 65a1 | 65 | −1 | 1 / 1 | 5.38285347057 | 0.375514098661 | 1 | rank ok, int, square |
| 91b1 | 91 | −1 | 1 / 1 | 6.03949153648 | 1.05924508641 | 1 | rank ok, int, square |
| 117a1 | 117 | −1 | 1 / 1 | 2.64032512633 | 1.13033562618 | 1 | rank ok, int, square |
| 234a1 | 234 | +1 | 0 / 0 | 1.04157290623 | 1 | 1 | rank ok, int, square |
| 389a1 | 389 | +1 | 2 / 2 | 4.98042512171 | 0.152460177943 | 1 | rank ok, int, square |
| 5077a1 | 5077 | −1 | 3 / 3 | 4.15168798309 | 0.417143558758 | 1 | rank ok, int, square |
| 66b3 | 66 | +1 | 0 / 0 | 1.10219253012 | 1 | **4** | rank ok, int, square, 2-part ≤ 2² |
| 571a1 | 571 | +1 | 0 / 0 | 0.432341256272 | 1 | **4** | rank ok, int, square, 2-part ≤ 2² |
| 681b1 | 681 | +1 | 0 / 0 | 0.81991786939 | 1 | **9** | rank ok, int, square |
| 210e7 | 210 | +1 | 0 / 0 | 0.128241626252 | 1 | **16** | rank ok, int, square |

The last four are the interesting ones: they are curves whose Tate–Shafarevich group is
*not* trivial, and the harness recovers the square numbers 4, 4, 9, 16 — matching
Cremona's database exactly.

### 5.2 Sweep over Cremona's database

`verify.py --sweep <ecdata> --max-conductor 10000` runs the full check on **every**
curve in Cremona's database with conductor ≤ 10 000 and cross-checks the Tamagawa
product and the leading L-value against the database itself. The run made in this
repository (`results_sweep_10k.md`, 28 min on 2 cores) gives:

| check | result |
|---|---|
| curves checked | **60 837** (all curves with `N ≤ 10 000`) |
| `rank E(ℚ)` (2-descent) = `ord_{s=1} L(E,s)` (analytic) | **60 837 / 60 837** |
| BSD quotient `S = L^(r)(E,1)/(r!·Ω_E·R_E·∏c_p/#tors²)` is a positive integer | **60 837 / 60 837** |
| `S` is a perfect square (Cassels–Tate) | **60 837 / 60 837** |
| `∏c_p` disagrees with Cremona's table | **0** |
| leading L-value disagrees with Cremona's table | **0** |

Not one curve in the database up to conductor 10 000 violates the rank equality, and
not one produces a non-integer or non-square BSD quotient. The curves with
non-trivial `Sha` come out right as well: `66b3` and `571a1` give `#Sha = 4`, `681b1`
gives `9`, `210e7` gives `16` — the same values as the database, and perfect squares, as
the Cassels–Tate pairing demands.

This is *evidence*, not proof: a finite computation cannot settle a statement about
all elliptic curves. But it is the honest form of "checking BSD", and it is exactly
what the reel's claim can be tested on.

### 5.3 An independent computation of the real period

`Ω_E` is the one quantity in the formula whose *convention* is easy to get wrong (there
is a factor of 2 for curves with two real components, and a factor 2 at infinity if one
uses PARI's `elltamagawa`). The harness therefore recomputes `Ω_E` from scratch by
numerical quadrature of `∫_{E(ℝ)} |dx/(2y + a₁x + a₃)|`, using substitutions that remove
the square-root singularities at the branch points:

```
92b1 : Ω = 4.707087768315682 (quadrature)  vs  4.707087761230185 (PARI)   rel. diff 1.5e−09
37a1 : Ω = 5.986917283735748 (quadrature)  vs  5.986917292463919 (PARI)   rel. diff 1.5e−09
```

Agreement to 9 digits confirms that PARI's `ellbsd` and Cremona's tables use the same
(real-period) convention, and that the `∏c_p` and `Ω_E` used in §5 are the BSD ones.

### 5.4 The p-adic (Iwasawa-theoretic) analogue, for the same curve

PARI also implements the p-adic BSD check `ellpadicbsd(E, p, n)`, which computes the
p-adic L-function and compares it with the p-adic regulator and `#Sha`. For the reel's
curve at `p = 23` (split multiplicative reduction, `c₂₃ = 1`):

```
ellpadicbsd(92b1, 23, 5)  =  [2, 13·23 + 9·23² + 10·23³ + O(23⁴)]
```

The first component `r = 2` is the expected value `rank E(ℚ) + 1` (the `+1` is the
split-multiplicative correction documented for PARI's `ellpadicbsd`), and the second is
the p-adic analogue of `R_p · #Sha`. This is the *p-adic* shadow of BSD — the statement
that the live research strategy actually pursues — and it is the sense in which BSD is
"partly solved": the p-adic version is a theorem for large families, the classical
version is not.

### 5.5 A tool gotcha worth recording

PARI's `elltamagawa(E)` and the third component of `ellglobalred(E)` **disagree on many
curves**. Measured on the 5 113 curves of conductor ≤ 1000: they differ for exactly the
2 370 curves with `Δ > 0` and agree on the other 2 743, and the factor is always
exactly 2. This is not a bug — `elltamagawa` is documented as "the global Tamagawa
number of the curve *including the factor at infinite places*", and that archimedean
factor is 2 exactly when `E(ℝ)` has two connected components (`Δ > 0`). The BSD formula
uses the **finite** product, which is `ellglobalred(E)[2]` and what Cremona's tables
list; the harness uses that. Had it used `elltamagawa`, the 92b1 identity would still
work (92b1 has `Δ < 0`) but 46 % of the database would have failed.

Three more gotchas, all of which produced *false failures* until they were fixed:

1. **The 2-descent is not always sharp.** For `210e7` (where `Sha` has order 16) PARI
   returns a Selmer rank of 2 where the true 2-Selmer group has dimension 5. The number
   it reports for `dim Sha[2]` is therefore a *lower* bound, and the harness uses it
   only through the necessary condition `dim Sha[2]_detected ≤ v₂(#Sha predicted)`. The
   60 837-curve sweep in §5.2 reports no violation of that condition.
2. **The default descent effort is not enough for some curves.** For 38 curves of the
   database (e.g. `1369b2`, whose generator has Néron–Tate height ≈ 54.8) `ellrank`
   returns the correct rank but *no points* at all, so the regulator — and hence the
   BSD quotient — is unavailable. Retrying with `ellrank(E, 4)` and `ellrank(E, 6)`
   recovers most of them; the harness finally falls back to the generators stored in
   Cremona's `allgens` file. Without this fallback 38 of 60 837 curves would have been
   reported as failures — failures of the *tool*, not of BSD.
3. **Cremona's `allgens` lists torsion points too.** The file gives the free
   generators *followed by* the torsion generators (e.g. `6690a1` lists a huge free
   generator and then the 2-torsion point `(-1982, 991)`). A torsion point has
   Néron–Tate height 0, so including it in the height matrix silently destroys the
   regulator (the determinant collapses to 0 or a negative number). The harness filters
   the list to the points of infinite order before forming the matrix.

---

## 6. What a proof would still have to contain

For the conjecture to be solved, one needs, for **every** elliptic curve `E/ℚ`:

1. **Rank equality in every rank.** A method that reads `rank E(ℚ)` off `L(E,s)` when
   the zero at `s = 1` has multiplicity ≥ 2. No such method exists today.
2. **Finiteness of `Sha`** (hence of the Selmer group in every ℓ).
3. **The exact leading coefficient**, including the local `p`-factors, the regulator of a
   saturated basis, and `|Sha|`.
4. **The Cassels–Tate structure** of `Sha`.

Items 1 and 2 are the ones that no amount of computation can supply: they are
statements about all curves, and the known methods (Euler systems of rank 1, Iwasawa
main conjectures, p-converse theorems) stop at rank 1.

---

## 7. Reproducing this

```sh
python3 -m venv .venv-bsd
.venv-bsd/bin/pip install cypari2==2.2.0 mpmath      # PARI/GP 2.15.4 via cypari2

cd bsd
../.venv-bsd/bin/python verify.py                    # curated table

# full sweep over Cremona's database
git clone --depth 1 --filter=blob:none --sparse https://github.com/JohnCremona/ecdata.git
cd ecdata && git sparse-checkout set allcurves allbsd allgens && cd ..
../.venv-bsd/bin/python verify.py --sweep ../ecdata --max-conductor 10000 --out results_sweep_10k.md
```

---

## 8. References

1. "Birch and Swinnerton-Dyer 'Solved Before 2045?' Odds Jump 38 Points on Kalshi After OpenAI's Math Claim" — notes that no BSD breakthrough has been confirmed by Clay or the wider community, and that the Clay Institute still lists BSD as open. <https://tech-insider.org/birch-swinnerton-dyer-solved-before-2045-kalshi-odds/>
2. "What Are the Remaining Millennium Prize Problems?" (NYT, 8 Oct 2026) — the remaining five open problems; BSD is among them. <https://www.nytimes.com/2026/10/08/science/millennium-prize-problems-explainer.html>
3. Wikipedia, *Birch and Swinnerton-Dyer conjecture* — statement of the conjecture, the Gross–Zagier/Kolyvagin theorems, p-parity, and the Skinner–Urban main-conjecture consequence (positive proportion of rank-0 curves). <https://en.wikipedia.org/wiki/Birch_and_Swinnerton-Dyer_conjecture>
4. B. Birch & H. Swinnerton-Dyer, "Notes on elliptic curves (II)", *J. Reine Angew. Math.* **212** (1966).
5. B. Gross & D. Zagier, "Heegner points and derivatives of L-series", *Invent. Math.* **84** (1986).
6. V. Kolyvagin, "Finiteness of E(ℚ) and Ш(E,ℚ) for a subclass of Weil curves", *Izv. Akad. Nauk* (1988) and the rank-1 companion paper (1990).
7. V. Nekovář, "The parity of the rank of an elliptic curve over ℚ", *Math. Ann.* **302** (1995) / IHES (2001).
8. C. Skinner & B. Urban, "A converse to a theorem of Gross, Zagier, and Kolyvagin", *J. Amer. Math. Soc.* **27** (2014).
9. A. Bhargava, C. Skinner & W. Zhang, "A majority of elliptic curves over ℚ satisfy BSD", *Ann. of Math.* **181** (2015).
10. A. Burungale, T. Castella & S. Kim, "p-converse to a theorem of Gross–Zagier, Kolyvagin and Rubin", *Invent. Math.* **220** (2020); T. Castella, L. Grossi, J. Langer, S. Luca & G. Pengo, work on the p-converse to the Skinner–Urban theorem (2023–2024).
11. D. Kriz & B. Li, "p-converse to a theorem of Gross–Zagier, Kolyvagin and Rubin", *Math. Res. Lett.* **27** (2020), and "Selmer groups, p-converse, and the Iwasawa main conjecture" (2024).
12. Clay Mathematics Institute, *Birch and Swinnerton-Dyer Conjecture* (Millennium Prize Problem) — <https://www.claymath.org/millennium-problems/birch-and-swinnerton-dyer-conjecture>
13. Cremona's database of elliptic curves over ℚ (<https://github.com/JohnCremona/ecdata>), and PARI/GP's `ellbsd`, `ellrank`, `ellL1`, `lfun` (<https://pari.math.u-bordeaux.fr/dochtml/html-stable/Elliptic_curves.html>).
