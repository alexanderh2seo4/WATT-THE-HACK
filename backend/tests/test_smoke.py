from fastapi.testclient import TestClient

from app.main import app, engine


client = TestClient(app)


def test_static_loads():
    s = client.get("/api/static").json()
    assert len(s["segments"]["features"]) == 64
    assert 380 <= len(s["cells"]["features"]) <= 450
    assert len(s["default_inputs"]["reports"]) == 6
    assert s["default_inputs"]["known_dead_segments"] == ["LINE_024"]


def test_drones_move_after_start():
    client.post("/api/sim/control", json={"action": "reset"})
    sps = client.post("/api/plan/start-positions").json()
    assert len(sps) == 5 and all(sp["segment_id"] != "LINE_024" for sp in sps)

    client.post("/api/sim/control", json={"action": "start", "speed": 60})
    before = client.get("/api/state").json()
    engine.step_n(300)  # 5 sim minutes, independent of wall time
    after = client.get("/api/state").json()

    assert after["status"] == "running" and after["t"] > before["t"]
    assert len(after["cells"]) == len(engine.static.cells["features"])
    moved = [a["position"] != b["position"] for a, b in zip(after["drones"], before["drones"])]
    assert all(moved)
    assert any(e["type"] == "takeoff" for e in after["events"])


def test_sim_two_hours_finds_faults():
    client.post("/api/sim/control", json={"action": "reset"})
    client.post("/api/sim/control", json={"action": "start", "speed": 600})
    engine.step_n(2 * 3600)
    s = client.get("/api/state").json()
    types = {e["type"] for e in s["events"]}
    assert {"takeoff", "landing", "finding"} <= types
    assert sum(c["inspected"] != "none" for c in s["cells"]) > 50
    assert any(c["top_fault"] for c in s["cells"])
