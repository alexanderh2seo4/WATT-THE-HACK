"""Load resources/ and build the Static object (network, ~500 m cells, storm, default inputs)."""

import json
from functools import cache
from pathlib import Path

from shapely.geometry import LineString, mapping, shape
from shapely.ops import substring

from app.geo import project, unproject
from app.models import OperatorInputs, Report, Static

REPO_ROOT = Path(__file__).resolve().parents[2]
RESOURCES = REPO_ROOT / "resources"
SCENARIOS = Path(__file__).resolve().parents[1] / "scenarios"

CELL_LENGTH_M = 500

# information_type -> fault types the report hints at (see ASSUMPTIONS.md "Report mapping")
REPORT_FAULT_TYPES = {
    "weather_alert": ["vegetation", "galloping", "broken_conductor"],
    "vegetation_and_access_report": ["vegetation"],
    "protection_event_summary": ["broken_conductor", "vegetation"],
    "visual_flash_report": ["hotspot", "broken_conductor"],
    "sound_and_warmth_report": ["hotspot"],
    "conductor_motion_report": ["galloping", "sag"],
}

# textual confidence -> number. For compound texts ("high that X; low for its location") we take the
# asset/location-level part, because that is what matters for where to fly.
CONFIDENCE = {"low": 0.2, "low to medium": 0.35, "medium": 0.5, "medium to high": 0.65, "high": 0.8}


def confidence_value(text: str) -> float:
    if "low for" in text:  # report 01 and 03: high for the event, low for location/asset
        return CONFIDENCE["low"]
    return CONFIDENCE.get(text.strip(), 0.5)


def _load(name: str) -> dict:
    return json.loads((RESOURCES / name).read_text())


def split_into_cells(segments: dict) -> dict:
    """Split every segment into n ≈ length/500 m equal pieces. cell_id = 'LINE_001#03' (0-based index)."""
    features = []
    for seg in segments["features"]:
        sid = seg["properties"]["segment_id"]
        line_m = project(shape(seg["geometry"]))
        n = max(1, round(line_m.length / CELL_LENGTH_M))
        step = line_m.length / n
        for i in range(n):
            piece = substring(line_m, i * step, (i + 1) * step)
            if not isinstance(piece, LineString):  # degenerate tiny piece; skip
                continue
            features.append({
                "type": "Feature",
                "geometry": mapping(unproject(piece)),
                "properties": {"cell_id": f"{sid}#{i:02d}", "segment_id": sid, "index": i,
                               "length_m": round(piece.length, 1)},
            })
    return {"type": "FeatureCollection", "features": features}


def default_inputs() -> OperatorInputs:
    reports = []
    for r in _load("scenario_public_config.json")["public_context"]["reports"]:
        reports.append(Report(
            report_id=r["information_id"],
            polygon={"type": "Polygon", "coordinates": [r["location_area_coordinates"]]},
            fault_types=REPORT_FAULT_TYPES.get(r["information_type"], ["vegetation"]),
            confidence=confidence_value(r["confidence"]),
            text=r["description"],
        ))
    return OperatorInputs(reports=reports, known_dead_segments=["LINE_024"])


@cache
def load_static() -> Static:
    segments = _load("grid_segments.geojson")
    context = _load("scenario_context.geojson")
    storm = next(f for f in context["features"] if f["properties"].get("context_kind") == "synthetic_storm_footprint")
    veg_path = RESOURCES / "external" / "vegetation.geojson"
    vegetation = json.loads(veg_path.read_text()) if veg_path.exists() else {"type": "FeatureCollection", "features": []}
    return Static(
        segments=segments,
        cells=split_into_cells(segments),
        nodes=_load("grid_nodes.geojson"),
        storm=storm,
        default_inputs=default_inputs(),
        vegetation=vegetation,
    )
