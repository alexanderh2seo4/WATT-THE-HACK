"""Benchmark stop: the sim pauses itself once when every ground-truth fault has been found."""

from app.data import load_static
from app.main import load_default_config
from app.planner import SmartPlanner
from app.sim.engine import Engine


def test_pauses_once_when_all_faults_found_and_resets():
    eng = Engine(load_static(), load_default_config(), SmartPlanner)
    eng.set_inputs(eng.static.default_inputs)  # "Load defaults"
    eng.plan_start_positions()
    eng.control("start")
    eng.step_n(4 * 3600)

    # paused exactly at the last fault's first finding
    p = eng.state().progress
    assert eng.status == "paused" and p.total == len(eng.config.faults) == len(p.found)
    assert p.all_found_t == eng.t == max(f.t_found for f in p.found)
    for f in p.found:  # t_found = first finding event of the fault's type on its cell
        first = next(e for e in eng.events if e.type == "finding" and e.cell_id == f.cell_id
                     and e.fault_type == f.fault_type)
        assert first.t == f.t_found and first.drone_id == f.drone_id
    assert [e.t for e in eng.events if e.type == "all_found"] == [p.all_found_t]

    # play continues and it never fires again
    t_found = p.all_found_t
    eng.control("resume")
    eng.step_n(2 * 3600)
    assert eng.status == "running" and eng.state().progress.all_found_t == t_found
    assert sum("faults found" in e.message for e in eng.events if e.type == "all_found") == 1

    # reset clears it
    eng.control("reset")
    p = eng.state().progress
    assert p.found == [] and p.all_found_t is None and p.all_confirmed_t is None


def test_no_faults_never_fires():
    cfg = load_default_config().model_copy(update={"faults": []})
    eng = Engine(load_static(), cfg, SmartPlanner)
    eng.plan_start_positions()
    eng.control("start")
    eng.step_n(3600)
    assert eng.status == "running" and eng.state().progress.all_found_t is None
