import time

from app.data import load_static
from app.geo import to_lonlat
from app.main import load_default_config
from app.models import Detection, DroneState, Event, Observation
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


def _finding(cell="LINE_035#23", dead=False, battery=20.0, flag=True):
    """A flying drone just saw possible vegetation on `cell` from the air: does the planner land it there?"""
    pl = SmartPlanner(load_static())
    cfg = load_default_config()
    pl.set_params(cfg.sensors, cfg.drone)
    pl.land_on_finding = flag
    seg = cell.split("#")[0]
    if dead:
        pl.on_event(Event(t=0, type="line_dead", segment_id=seg, message="dead"))
    pl.on_observation(Observation(t=60, drone_id="D4", cell_id=cell, segment_id=seg, mode="air",
                                  detections=[Detection(fault_type="vegetation", confidence=0.63)]))
    i = pl.net.cell_idx[cell]
    pos = list(to_lonlat(*pl.net.cell_mid[i]))
    drone = DroneState(drone_id="D4", position=pos, status="flying", battery_min=battery, segment_id=seg)
    return pl, pl.confirm_route(drone, cell), pos


def test_land_on_finding_reroutes_when_feasible():
    pl, route, pos = _finding()
    assert route and route[-1].segment_id == "LINE_035" and route[-1].position == pos  # lands on the finding cell
    assert pl.claim_land["D4"] == pl.net.cell_idx["LINE_035#23"]  # one drone per landing line: others keep off


def test_land_on_finding_keeps_plan_when_infeasible():
    assert _finding(battery=7.5)[1] is None  # 3 min landing + 5 min reserve don't fit
    assert _finding(dead=True)[1] is None  # never land on a dead line
    assert _finding(flag=False)[1] is None  # flag off = old behaviour
