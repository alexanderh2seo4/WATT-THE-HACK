from uuid import uuid4

from fastapi.testclient import TestClient

from app.gateway import IDLE_SECONDS, MAX_SESSIONS, app


def test_private_sessions_and_capacity():
    headers = [{"X-Session-ID": str(uuid4())} for _ in range(MAX_SESSIONS + 1)]
    with TestClient(app) as client:
        assert client.get("/api/sim/presets").status_code == 200
        assert client.get("/api/health").json()["sessions"] == 0
        first = client.get("/api/state", headers=headers[0]).json()
        second = client.get("/api/state", headers=headers[1]).json()
        assert first["status"] == second["status"] == "setup"

        inputs = client.get("/api/static", headers=headers[0]).json()["default_inputs"]
        assert client.put("/api/inputs", headers=headers[0], json=inputs).status_code == 200
        assert len(client.post("/api/plan/start-positions", headers=headers[0]).json()) == 5
        client.post("/api/sim/control", headers=headers[0], json={"action": "start", "speed": 60})
        client.post("/api/sim/control", headers=headers[1], json={"action": "reset"})
        assert client.get("/api/state", headers=headers[0]).json()["status"] == "running"
        other = client.get("/api/state", headers=headers[1]).json()
        assert other["status"] == "setup" and other["inputs"]["reports"] == [] and other["drones"] == []

        config = client.get("/api/sim/config", headers=headers[0]).json()
        original_seed = config["seed"]
        config["seed"] += 1
        client.put("/api/sim/config", headers=headers[0], json=config)
        assert client.get("/api/sim/config", headers=headers[1]).json()["seed"] == original_seed

        for visitor in headers[2:MAX_SESSIONS]:
            assert client.get("/api/state", headers=visitor).status_code == 200
        workers = list(app.state.pool.workers.values())
        assert len({worker.process.pid for worker in workers}) == MAX_SESSIONS
        full = client.get("/api/state", headers=headers[-1])
        assert full.status_code == 503 and "8 private demo sessions" in full.json()["detail"]
        assert client.get("/api/state", headers=headers[0]).status_code == 200

        # An expired visitor frees a process/slot for the next person, not a shared simulation.
        expired = app.state.pool.workers[headers[1]["X-Session-ID"]]
        expired.last_seen -= IDLE_SECONDS + 1
        assert client.get("/api/state", headers=headers[-1]).status_code == 200
        assert expired.process.returncode is not None
        assert client.get("/api/health").json() == {"status": "ok", "sessions": MAX_SESSIONS, "capacity": 8}
        remaining = list(app.state.pool.workers.values())
    assert all(worker.process.returncode is not None for worker in remaining)
