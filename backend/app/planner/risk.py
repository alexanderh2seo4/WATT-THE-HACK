"""Pure belief-update functions (PLAN.md §4.3). Shared by DumbPlanner and the smart planner."""


def combine(ps: list[float]) -> float:
    """risk = 1 - prod(1 - p_i) over independent contributions."""
    ok = 1.0
    for p in ps:
        ok *= 1 - p
    return 1 - ok


def update_no_finding(p: float, pd: float) -> float:
    """Inspection without a finding: p <- p(1-pd) / (p(1-pd) + (1-p))."""
    num = p * (1 - pd)
    den = num + (1 - p)
    return num / den if den > 0 else p


def update_finding(p: float, pd: float, pfp: float, confidence: float = 1.0) -> float:
    """Finding: p <- p·pd / (p·pd + (1-p)·pfp).

    `confidence` (the sensor's own certainty, 0..1) softens the evidence: we mix the Bayes posterior
    with the prior, so a shaky detection lands in the "needs confirmation" band instead of > 0.8.
    """
    num = p * pd
    den = num + (1 - p) * pfp
    post = num / den if den > 0 else p
    return confidence * post + (1 - confidence) * p


def update_live(p_live: float, reads_live: bool, accuracy: float) -> float:
    """Live/dead reading with symmetric accuracy (magnetometer ~0.9, current sensor when landed = 1)."""
    like_live = accuracy if reads_live else 1 - accuracy
    like_dead = 1 - accuracy if reads_live else accuracy
    den = p_live * like_live + (1 - p_live) * like_dead
    return p_live * like_live / den if den > 0 else p_live
