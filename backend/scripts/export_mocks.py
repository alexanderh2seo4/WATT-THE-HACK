"""Write frontend mocks + OpenAPI schema from the real backend.

Run from backend/:  uv run python scripts/export_mocks.py
Outputs: frontend/src/mocks/static.json, frontend/src/mocks/state.json, frontend/openapi.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data import REPO_ROOT, load_static  # noqa: E402
from app.main import app, make_engine  # noqa: E402

SIM_MINUTES = 8  # drones are mid-flight at this point


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {path.relative_to(REPO_ROOT)}")


def main() -> None:
    frontend = REPO_ROOT / "frontend"
    engine = make_engine()
    engine.set_inputs(engine.static.default_inputs)
    engine.plan_start_positions()
    engine.control("start")
    engine.step_n(SIM_MINUTES * 60)
    write(frontend / "src" / "mocks" / "static.json", load_static().model_dump(mode="json"))
    write(frontend / "src" / "mocks" / "state.json", engine.state().model_dump(mode="json"))
    write(frontend / "openapi.json", app.openapi())


if __name__ == "__main__":
    main()
