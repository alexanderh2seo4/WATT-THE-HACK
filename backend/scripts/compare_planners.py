"""Compare planners on a scenario over several seeds.

Run from backend/:  [SCENARIO=demo|default] uv run python scripts/compare_planners.py [hours] [seeds...]
Metrics per fault: first finding event of the right type on the fault's cell.
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data import load_static  # noqa: E402
from app.main import load_default_config  # noqa: E402
from app.planner import PLANNERS  # noqa: E402
from app.sim.engine import Engine  # noqa: E402


def run(planner: str, seed: int, hours: float) -> dict:
    cfg = load_default_config(os.environ.get("SCENARIO", "demo")).model_copy(update={"seed": seed})
    eng = Engine(load_static(), cfg, PLANNERS[planner])
    t0 = time.perf_counter()
    eng.plan_start_positions()
    eng.control("start")
    eng.step_n(int(hours * 3600))
    wall = time.perf_counter() - t0
    first = {}
    for f in cfg.faults:
        cell = eng._cell_of(f.segment_id, f.position)
        hit = next((e.t for e in eng.events if e.type == "finding" and e.cell_id == cell
                    and e.fault_type == f.fault_type), None)
        first[f.fault_id] = hit
    fault_cells = {eng._cell_of(f.segment_id, f.position) for f in cfg.faults}
    false_crew = sum(1 for e in eng.events if e.type == "recommendation" and e.message.startswith("Send repair")
                     and e.cell_id not in fault_cells)
    st = eng.state()
    return {"first": first, "wall": wall, "inspected": sum(c.inspected != "none" for c in st.cells),
            "landings": sum(e.type == "landing" for e in eng.events),
            "stranded": sum(e.type == "stranded" for e in eng.events), "false_crew": false_crew,
            "faults": {f.fault_id: f.fault_type for f in cfg.faults}}


def main() -> None:
    hours = float(sys.argv[1]) if len(sys.argv) > 1 else 4
    seeds = [int(s) for s in sys.argv[2:]] or [1, 2, 3, 4, 5]
    rows = []
    for name in os.environ.get("CMP", "dumb,smart").split(","):
        res = [run(name, s, hours) for s in seeds]
        faults = res[0]["faults"]
        found = [sum(v is not None for v in r["first"].values()) for r in res]
        times = [v / 60 for r in res for v in r["first"].values() if v is not None]
        per_fault = {fid: [r["first"][fid] for r in res] for fid in faults}
        rows.append((name, found, times, per_fault, res, faults))
    print(f"\n{os.environ.get('SCENARIO', 'demo')}, {hours:g} h sim, seeds {seeds}\n")
    fids = list(rows[0][5])
    head = "| planner | faults found (of 4) | mean time to detection | " + " | ".join(
        f"{fid} {rows[0][5][fid]}" for fid in fids) + " | cells inspected | landings | stranded | false crew calls | compute |"
    print(head)
    print("|" + "---|" * (head.count("|") - 1))
    for name, found, times, per_fault, res, faults in rows:
        cols = []
        for fid in fids:
            ts = [t for t in per_fault[fid] if t is not None]
            cols.append(f"{len(ts)}/{len(res)}" + (f", {sum(ts) / len(ts) / 60:.0f} min" if ts else ""))
        n = len(res)
        print(f"| {name} | {sum(found) / n:.1f} | {sum(times) / len(times) if times else float('nan'):.0f} min | "
              + " | ".join(cols)
              + f" | {sum(r['inspected'] for r in res) / n:.0f} | {sum(r['landings'] for r in res) / n:.1f} | "
                f"{sum(r['stranded'] for r in res) / n:.1f} | {sum(r['false_crew'] for r in res) / n:.1f} | "
                f"{max(r['wall'] for r in res):.1f} s |")


if __name__ == "__main__":
    main()
