"""FastAPI app: all endpoints of PLAN.md §3.1. One in-memory Engine, stepped on every GET /api/state."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.data import SCENARIOS, load_static
from app.models import OperatorInputs, SimConfig, SimControl, StartPosition, State, Static
from app.planner import DumbPlanner
from app.sim.engine import Engine


def load_default_config() -> SimConfig:
    return SimConfig.model_validate_json((SCENARIOS / "default.json").read_text())


def make_engine() -> Engine:
    return Engine(load_static(), load_default_config(), DumbPlanner)


app = FastAPI(title="Drone grid inspection")
app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["*"], allow_headers=["*"])
engine = make_engine()


@app.get("/api/static", response_model=Static)
def get_static():
    return load_static()


@app.get("/api/state", response_model=State)
def get_state():
    engine.advance()
    return engine.state()


@app.put("/api/inputs", response_model=OperatorInputs)
def put_inputs(inputs: OperatorInputs):
    engine.set_inputs(inputs)
    return engine.inputs


@app.post("/api/plan/start-positions", response_model=list[StartPosition])
def plan_start_positions():
    return engine.plan_start_positions()


@app.get("/api/sim/config", response_model=SimConfig)
def get_sim_config():
    return engine.config


@app.put("/api/sim/config", response_model=SimConfig)
def put_sim_config(config: SimConfig):
    engine.set_config(config)  # resets the sim
    return engine.config


@app.post("/api/sim/control", response_model=State)
def sim_control(cmd: SimControl):
    engine.control(cmd.action, cmd.speed)
    return engine.state()
