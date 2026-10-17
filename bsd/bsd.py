"""
bsd.py -- a small, self-contained toolkit for *testing* the
Birch and Swinnerton-Dyer conjecture for elliptic curves over Q.

What this module does
---------------------
For an elliptic curve E/Q it computes, from PARI/GP (via cypari2):

  * the conductor N, the local reduction data and the Tamagawa numbers c_p,
  * the Mordell-Weil rank r_alg together with a 2-Selmer upper bound,
  * a saturated Mordell-Weil basis and the Neron-Tate regulator R,
  * the leading Taylor coefficient L^(r)(E,1)/r! of the Hasse-Weil L-function,
  * the order of vanishing of L(E,s) at s=1 (the "analytic rank" r_an),

and then evaluates the BSD identity

        L^(r)(E,1)/r!  =  Omega_E * R * #Sha(E/Q) * prod_p c_p / #E(Q)_tors^2

by computing the predicted value of the Tate-Shafarevich group

        S_pred = L^(r)(E,1) / ( r! * Omega_E * R * prod_p c_p / #tors^2 ).

S_pred must be a positive integer, and by the Cassels--Tate pairing it must in
fact be a perfect square.  Failure of either test would refute BSD; passing
them is (very strong) numerical evidence, not a proof.

Conventions
-----------
Omega_E is the "real period" of the BSD formula, i.e. the integral of the
absolute value of the Neron differential over the real locus E(R):
        Omega_E = \\int_{E(R)} |dx/(2y + a1 x + a3)| .
This is the convention used by Cremona's tables and by LMFDB.  PARI's
`ellbsd` uses the same convention.

The regulator is the determinant of the Neron-Tate height pairing matrix in
PARI's ("Cremona") normalisation <P,Q> = (h(P+Q) - h(P) - h(Q))/2, so that for
a rank-1 group R = h(P) for a basis vector P.

Author: generated for the BSD status report in this repository.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from cypari2 import Pari

PREC = 38  # working precision in significant digits (PARI is built w/o MPFR here)

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _pari() -> Pari:
    p = Pari()
    p(f"default(realprecision,{PREC})")
    try:
        p.allocatemem(256_000_000)
    except Exception:
        p("default(parisize,256000000)")
    return p


def _f(x) -> float:
    """PARI Gen -> python float."""
    return float(x)


def _is_int_square(x: float, tol: float = 1e-6) -> bool:
    if x <= 0:
        return False
    r = math.sqrt(x)
    return abs(r - round(r)) < tol * max(1.0, r)


def _nearest_int(x: float, tol: float = 1e-6) -> int:
    r = round(x)
    if abs(x - r) > tol * max(1.0, abs(x)):
        raise ValueError(f"value {x!r} is not close to an integer")
    return int(r)


def _det(mat) -> float:
    """Determinant of a small PARI matrix (rank <= 3)."""
    n = len(mat)
    if n == 0:
        return 1.0
    entries = [[float(mat[i][j]) for j in range(n)] for i in range(n)]
    if n == 1:
        return entries[0][0]
    if n == 2:
        return entries[0][0] * entries[1][1] - entries[0][1] * entries[1][0]
    if n == 3:
        a, b, c = entries[0]
        d, e, f = entries[1]
        g, h, i = entries[2]
        return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    raise ValueError("determinant only implemented up to 3x3")


# --------------------------------------------------------------------------
# data classes
# --------------------------------------------------------------------------


@dataclass
class LocalData:
    conductor: int
    root_number: int
    tamagawa_product: int
    tamagawa_by_prime: dict
    bad_primes: list


@dataclass
class MordellWeil:
    rank: int
    selmer_rank: int      # rank of the 2-Selmer group (upper bound for r)
    sha2_dim: int         # dim Sha(E/Q)[2] as bounded by the 2-descent
    generators: list  # list of PARI points (saturated basis)
    regulator: float
    torsion_order: int
    torsion_orders: list  # orders of the cyclic factors of E(Q)_tors


@dataclass
class AnalyticData:
    analytic_rank: int
    leading_coefficient: float  # L^(r)(E,1)/r!
    taylor: list = field(default_factory=list)  # L^(r)(E,1) for r=0..


@dataclass
class BSDFacts:
    label: str
    coeffs: list
    local: LocalData
    mw: MordellWeil
    an: AnalyticData
    real_period: float
    sha_predicted: float
    ok_rank: bool
    ok_sha_integer: bool
    ok_sha_square: bool
    selmer_bound_on_sha2: int
    ok_sha2_bound: bool = True
    notes: list = field(default_factory=list)

    @property
    def all_ok(self) -> bool:
        return (
            self.ok_rank
            and self.ok_sha_integer
            and self.ok_sha_square
            and self.ok_sha2_bound
        )


# --------------------------------------------------------------------------
# the workhorse
# --------------------------------------------------------------------------


class BSDChecker:
    def __init__(self, pari: Pari | None = None):
        self.p = pari or _pari()

    # ---------------- local data ----------------

    def local_data(self, E) -> LocalData:
        p = self.p
        red = p.ellglobalred(E)
        N = int(red[0])
        w = int(p.ellrootno(E))
        # red[2] is the product of the local Tamagawa numbers c_p; the last
        # component lists, for each bad prime, [type, v_p(Delta), ?, c_p].
        # NB: we use red[2] (not PARI's elltamagawa) because the two disagree
        # for non-split multiplicative reduction -- see README.
        tam_by_prime = {}
        bad = []
        if len(red) >= 5:
            local = red[4]
            mat = red[3]
            # red[3] is the matrix [bad primes ; exponents]; note that
            # indexing a PARI matrix with one subscript returns a *column*.
            col = mat[0]
            bad = [int(col[i]) for i in range(len(col))]
            for i in range(len(bad)):
                entry = local[i]
                tam_by_prime[int(bad[i])] = int(entry[3])
        tam = int(red[2])
        return LocalData(
            conductor=N,
            root_number=w,
            tamagawa_product=tam,
            tamagawa_by_prime=tam_by_prime,
            bad_primes=bad,
        )

    # ---------------- Mordell-Weil group ----------------

    def mordell_weil(self, E, sat_bound: int = 200, basis=None) -> MordellWeil:
        p = self.p
        info = p.ellrank(E)
        # PARI returns [r, r2, s2, G]: the rank, the rank of the 2-Selmer
        # group, the dimension of Sha(E/Q)[2] seen by the 2-descent, and a
        # (possibly unsatured) set of generators.
        rank = int(info[0])
        selmer = int(info[1])
        sha2 = int(info[2]) if len(info) >= 3 else 0
        gens = list(info[3]) if len(info) >= 4 else []
        # PARI's default effort can fail to produce points for curves with
        # very large generators (e.g. 1110c3): retry with more effort.
        if rank > 0 and not gens:
            for effort in (4, 6):
                try:
                    info2 = p.ellrank(E, effort)
                except Exception:
                    continue
                g2 = list(info2[3]) if len(info2) >= 4 else []
                if g2:
                    info, gens = info2, g2
                    rank = int(info2[0])
                    selmer = int(info2[1])
                    sha2 = int(info2[2]) if len(info2) >= 3 else 0
                    break
        if basis:
            # An externally supplied basis (e.g. from Cremona's `allgens`)
            # lists the free generators *followed by the torsion generators*;
            # torsion points have Neron-Tate height 0 and would destroy the
            # height matrix, so keep only the points of infinite order.
            keep = []
            for pt in basis:
                try:
                    h = float(p.ellheightmatrix(E, p([pt]))[0][0])
                except Exception:
                    h = 0.0
                if h > 0:
                    keep.append(pt)
            gens = keep[:rank] if len(keep) >= rank else list(basis)[:rank]
        elif gens:
            try:
                gens = list(p.ellsaturation(E, p(gens), sat_bound))
            except Exception:
                gens = list(info[3])
        if gens:
            hm = p.ellheightmatrix(E, p(gens))
            reg = _det(hm)
        else:
            reg = 1.0
        tors = p.elltors(E)
        torder = int(tors[0])
        torders = [int(o) for o in tors[1]] if len(tors) >= 2 else []
        return MordellWeil(
            rank=rank,
            selmer_rank=selmer,
            sha2_dim=sha2,
            generators=gens,
            regulator=reg,
            torsion_order=torder,
            torsion_orders=torders,
        )

    # ---------------- L-function ----------------

    def analytic(self, coeffs, max_rank: int = 4) -> AnalyticData:
        """Order of vanishing of L(E,s) at s=1 and the leading Taylor coefficient.

        PARI's `lfun` is used (not `ellL1`, whose vanishing values are only
        accurate to ~1e-19).  The order of vanishing is detected with a
        threshold relative to the largest Taylor coefficient computed.
        """
        p = self.p
        cstr = "[" + ",".join(str(int(c)) for c in coeffs) + "]"
        taylor = []
        for r in range(max_rank + 1):
            taylor.append(float(p(f"lfun(ellinit({cstr}),1,{r})")))
        scale = max(abs(v) for v in taylor) or 1.0
        tol = 1e-15 * scale
        r_an = None
        for r, v in enumerate(taylor):
            if abs(v) > tol:
                r_an = r
                break
        if r_an is None:
            raise ValueError(f"could not determine the order of vanishing: {taylor!r}")
        return AnalyticData(
            analytic_rank=r_an,
            leading_coefficient=taylor[r_an],
            taylor=taylor,
        )

    # ---------------- real period (independent numerical check) ----------------

    def real_period_numeric(self, coeffs) -> float:
        """Omega_E = \\int_{E(R)} |dx/(2y+a1x+a3)| by numerical quadrature.

        Only implemented for a1 = a2 = a3 = 0 models (y^2 = x^3 + ax + b),
        which covers every curve in the test set; other models raise.
        """
        import mpmath as mp

        a1, a2, a3, a4, a6 = [int(c) for c in coeffs]
        if (a1, a2) != (0, 0):
            raise NotImplementedError("numeric period implemented for a1=a2=0 models only")
        if a3:
            # y -> Y - a3/2 turns y^2 + a3 y = x^3 + a4 x + a6 into
            # Y^2 = x^3 + a4 x + a6 + a3^2/4 and leaves the Neron
            # differential dx/(2y + a3) = dx/(2Y) unchanged.
            a6 = a6 + mp.mpf(a3) ** 2 / 4
        # Y^2 = x^3 + a4 x + a6
        roots = mp.polyroots([1, 0, a4, a6], maxsteps=200, extraprec=400)
        reals = sorted([mp.re(r) for r in roots if abs(mp.im(r)) < mp.mpf("1e-30")],
                       key=float)
        f = lambda x: mp.sqrt(mp.fabs(x ** 3 + a4 * x + a6))
        total = mp.mpf(0)
        if len(reals) == 1:
            e1 = reals[0]
            # x = e1 + t^2 removes the square-root singularity at the endpoint
            total += mp.quad(
                lambda t: 2 * t / f(e1 + t ** 2), [0, 1, mp.inf]
            )
        elif len(reals) == 3:
            e3, e2, e1 = reals  # ascending order
            c = (e2 + e3) / 2
            h = (e2 - e3) / 2
            total += mp.quad(
                lambda t: 2 * t / f(e1 + t ** 2), [0, 1, mp.inf]
            )
            # x = e3 + (e2-e3) sin^2(theta) for the bounded component:
            # dx/sqrt(f(x)) = 2 dtheta / sqrt(e1 - x), which is smooth.
            total += mp.quad(
                lambda th: 2 / mp.sqrt(e1 - (e3 + (e2 - e3) * mp.sin(th) ** 2)),
                [0, mp.pi / 4, mp.pi / 2],
            )
        else:
            raise ValueError("unexpected number of real roots")
        return float(mp.re(total))

    # ---------------- p-adic (Iwasawa-theoretic) BSD ----------------

    def padic_bsd(self, coeffs, p: int, n: int = 5):
        """PARI's p-adic BSD check: returns [r, Lp] for the p-adic L-function.

        `r` is an upper bound for the analytic rank of the p-adic L-function;
        it is expected to equal rank E(Q) (+1 if the reduction at p is split
        multiplicative).  `Lp` is conjecturally `R_p * #Sha`.
        """
        cstr = "[" + ",".join(str(int(c)) for c in coeffs) + "]"
        out = self.p(f"ellpadicbsd(ellinit({cstr}),{int(p)},{int(n)})")
        return [int(out[0]), str(out[1])]

    # ---------------- the check itself ----------------

    def check(self, coeffs: Sequence[int], label: str = "", basis=None) -> BSDFacts:
        p = self.p
        E = p.ellinit(list(coeffs))
        loc = self.local_data(E)
        mw = self.mordell_weil(E, basis=basis)
        an = self.analytic(list(coeffs))

        # Omega_E from PARI's ellbsd:  ellbsd = Omega * prod c_p / #tors^2
        c = float(p.ellbsd(E))
        omega = c * mw.torsion_order ** 2 / loc.tamagawa_product if loc.tamagawa_product else float("nan")

        notes = []
        if not mw.generators and mw.rank > 0:
            notes.append("no Mordell-Weil generators found")
        if mw.selmer_rank is not None and mw.rank > mw.selmer_rank:
            notes.append("rank exceeds 2-Selmer bound -- inconsistent data")

        # BSD leading-coefficient identity
        r = an.analytic_rank
        if r != mw.rank:
            notes.append(
                f"rank mismatch: algebraic {mw.rank} vs analytic {r}"
            )
        # S_pred = L^(r)(1) / (r! * Omega * R * prod c_p / tors^2)
        denom = math.factorial(r) * omega * mw.regulator * loc.tamagawa_product / mw.torsion_order ** 2
        sha = an.leading_coefficient / denom if denom else float("nan")
        ok_int = math.isfinite(sha) and abs(sha - round(sha)) < 1e-6 * max(1.0, abs(sha))
        ok_sq = ok_int and _is_int_square(sha)

        # The 2-descent detects a subgroup of Sha[2]; when it is sharp it
        # gives dim Sha[2] exactly, otherwise only a lower bound (PARI's
        # descent is not always able to find the full Selmer group, e.g. for
        # 210e7 it finds a 2-dimensional Selmer group where the true one has
        # dimension 5).  Therefore the *necessary* condition is
        #     dim Sha[2] detected  <=  v_2(#Sha predicted),
        # and equality means the descent was sharp.
        dim2 = sum(1 for o in mw.torsion_orders if o % 2 == 0)
        selmer_bound = 2 ** max(0, mw.sha2_dim)
        v2_sha = 0
        if ok_int and round(sha) > 0:
            v2_sha = int(round(math.log2(round(sha))))
        ok_sha2 = (not ok_int) or (mw.sha2_dim <= v2_sha)
        if not ok_sha2:
            notes.append(
                f"2-descent detects a 2-part of Sha of size {selmer_bound}, "
                f"larger than the BSD-predicted 2^{v2_sha}"
            )
        elif ok_int and mw.sha2_dim < v2_sha:
            notes.append(
                f"2-descent is not sharp: it detects 2^{mw.sha2_dim} of the "
                f"predicted 2^{v2_sha}"
            )

        return BSDFacts(
            label=label,
            coeffs=list(coeffs),
            local=loc,
            mw=mw,
            an=an,
            real_period=omega,
            sha_predicted=sha,
            ok_rank=(r == mw.rank),
            ok_sha_integer=ok_int,
            ok_sha_square=ok_sq,
            ok_sha2_bound=ok_sha2,
            selmer_bound_on_sha2=selmer_bound,
            notes=notes,
        )


# --------------------------------------------------------------------------
# Cremona database (allcurves / allbsd) parsing
# --------------------------------------------------------------------------

_CURVE_RE = re.compile(
    r"^(?P<label>\d+)\s+(?P<cls>[a-z])\s+(?P<idx>\d+)\s+\[(?P<coeffs>[^\]]*)\]\s+"
    r"(?P<rank>-?\d+)\s+(?P<tors>\d+)(?P<rest>.*)$"
)
_BSD_RE = re.compile(
    r"^(?P<label>\d+)\s+(?P<cls>[a-z])\s+(?P<idx>\d+)\s+\[(?P<coeffs>[^\]]*)\]\s+"
    r"(?P<rank>-?\d+)\s+(?P<tors>\d+)\s+(?P<tam>\d+)\s+(?P<omega>[\d.eE+-]+)\s+"
    r"(?P<lval>[\d.eE+-]+)\s+(?P<reg>[\d.eE+-]+)\s+(?P<sha>[\d.eE+-]+)\s*$"
)


def parse_allcurves(path: str, max_conductor: int | None = None) -> list:
    out = []
    with open(path) as fh:
        for line in fh:
            m = _CURVE_RE.match(line.strip())
            if not m:
                continue
            if max_conductor is not None and int(m.group("label")) > max_conductor:
                continue
            coeffs = [int(x) for x in m.group("coeffs").split(",")]
            out.append(
                {
                    "label": f"{m.group('label')}{m.group('cls')}{m.group('idx')}",
                    "coeffs": coeffs,
                    "rank": int(m.group("rank")),
                    "tors": int(m.group("tors")),
                }
            )
    return out


def parse_allbsd(path: str, max_conductor: int | None = None) -> dict:
    out = {}
    with open(path) as fh:
        for line in fh:
            m = _BSD_RE.match(line.strip())
            if not m:
                continue
            if max_conductor is not None and int(m.group("label")) > max_conductor:
                continue
            out[f"{m.group('label')}{m.group('cls')}{m.group('idx')}"] = {
                "coeffs": [int(x) for x in m.group("coeffs").split(",")],
                "rank": int(m.group("rank")),
                "tors": int(m.group("tors")),
                "tamagawa": int(m.group("tam")),
                "omega": float(m.group("omega")),
                "lvalue": float(m.group("lval")),
                "regulator": float(m.group("reg")),
                "sha": float(m.group("sha")),
            }
    return out


_GEN_RE = re.compile(
    r"^(?P<label>\d+)\s+(?P<cls>[a-z])\s+(?P<idx>\d+)\s+\[(?P<coeffs>[^\]]*)\]\s+"
    r"(?P<rank>-?\d+)\s+\[(?P<tors>[^\]]*)\]\s*(?P<gens>.*)$"
)


def parse_allgens(path: str, max_conductor: int | None = None) -> dict:
    """Parse Cremona's `allgens` file: label -> list of affine generators.

    The file stores generators in projective coordinates [x:y:z]; they are
    converted to the affine pair (x/z, y/z) that PARI expects.
    """
    out = {}
    with open(path) as fh:
        for line in fh:
            m = _GEN_RE.match(line.strip())
            if not m:
                continue
            if max_conductor is not None and int(m.group("label")) > max_conductor:
                continue
            gens = []
            for g in re.findall(r"\[(-?\d+):(-?\d+):(-?\d+)\]", m.group("gens")):
                x, y, z = (int(v) for v in g)
                if z:
                    gens.append((x, y, z))
            out[f"{m.group('label')}{m.group('cls')}{m.group('idx')}"] = gens
    return out
