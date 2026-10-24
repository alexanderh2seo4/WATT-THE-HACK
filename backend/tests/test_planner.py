import time

from app.data import load_static
from app.main import load_default_config
from app.planner import SmartPlanner
from app.sim.engine import Engine


def test_smart_start_positions():
    static = load_static()
    pl = SmartPlanner(static)
    cfg = load_default_config()
    pl.set_params(cfg.sensors, cfg.drone)
    sps = pl.start_positions(5)
    segs = [sp.segment_id for sp in sps]
    assert len(sps) == 5 and len(set(segs)) == 5
    assert all(pl.p_live[s] > 0.5 and s not in static.default_inputs.known_dead_segments for s in segs)
    assert all(sp.reason and "exp. risk" in sp.reason for sp in sps)
    risk = [c.risk for c in pl.cell_states()]
    assert max(risk) > 0.3 and min(risk) < 0.05  # visible variation on the map


def test_smart_four_hours_fast_and_finds_faults():
    eng = Engine(load_static(), load_default_config(), SmartPlanner)
    eng.set_inputs(eng.static.default_inputs)  # "Load defaults"
    t0 = time.perf_counter()
    eng.plan_start_positions()
    eng.control("start")
    eng.step_n(4 * 3600)
    assert time.perf_counter() - t0 < 10
    st = eng.state()
    assert not any(d.status == "stranded" for d in st.drones)
    fault_cells = {eng._cell_of(f.segment_id, f.position) for f in eng.config.faults}
    assert any(e.type == "finding" and e.cell_id in fault_cells for e in st.events)
