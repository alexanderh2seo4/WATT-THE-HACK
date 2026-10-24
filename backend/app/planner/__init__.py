"""Planner interface (PLAN.md §3.3) + a deliberately dumb placeholder strategy.

The planner never imports app.sim. It only sees OperatorInputs and Events.
BE1 replaces DumbPlanner with the real strategy (risk prior, greedy start positions, Bayes updates).
"""

from shapely.geometry import Point, shape

from app.geo import dist_m
from app.models import (CellState, DroneState, Event, OperatorInputs, SegmentState, StartPosition, Static,
                        Waypoint)

P_LIVE_PRIOR = 0.9
RESERVE_MIN = 5
MIN_TAKEOFF_BATTERY_MIN = 20  # dumb rule: charge to 20 min before flying again


class Planner:
    """Interface. The sim/engine only calls these methods."""

    def __init__(self, static: Static): ...
    def set_inputs(self, inputs: OperatorInputs) -> None: ...
    def start_positions(self, n: int = 5) -> list[StartPosition]: ...
    def on_event(self, event: Event) -> None: ...
    def next_route(self, drone: DroneState, speed_mps: float = 10, landing_min: float = 3) -> list[Waypoint] | None: ...
    def cell_states(self) -> list[CellState]: ...
    def segment_states(self) -> list[SegmentState]: ...


class DumbPlanner(Planner):
    """Start on the midpoints of the 5 longest non-dead lines; fly along the line network, ignoring risk."""

    def __init__(self, static: Static):
        self.static = static
        self.segs = {f["properties"]["segment_id"]: f for f in static.segments["features"]}
        self.cells = static.cells["features"]
        self.inputs = OperatorInputs()
        self.dead: set[str] = set()
        self.risk: dict[str, float] = {}
        self.visited: dict[str, set[str]] = {}  # drone_id -> segments it already flew
        self.set_inputs(static.default_inputs)

    def set_inputs(self, inputs: OperatorInputs) -> None:
        self.inputs = inputs
        self.dead = set(inputs.known_dead_segments)
        polys = [(shape(r.polygon), r.confidence) for r in inputs.reports]
        self.risk = {}
        for c in self.cells:  # placeholder: 1 - prod(1 - 0.5 * confidence) over reports covering the cell
            mid = shape(c["geometry"]).interpolate(0.5, normalized=True)
            p_ok = 1.0
            for poly, conf in polys:
                if poly.contains(Point(mid)):
                    p_ok *= 1 - 0.5 * conf
            self.risk[c["properties"]["cell_id"]] = round(1 - p_ok, 3)

    def start_positions(self, n: int = 5) -> list[StartPosition]:
        candidates = sorted((s for s in self.segs if s not in self.dead),
                            key=lambda s: -self.segs[s]["properties"]["length_km"])[:n]
        out = []
        for i, sid in enumerate(candidates):
            mid = shape(self.segs[sid]["geometry"]).interpolate(0.5, normalized=True)
            out.append(StartPosition(drone_id=f"D{i + 1}", segment_id=sid, position=[mid.x, mid.y],
                                     reason=f"placeholder: midpoint of long line {sid} "
                                            f"({self.segs[sid]['properties']['length_km']:.1f} km)"))
        return out

    def on_event(self, event: Event) -> None:
        if event.type == "line_dead" and event.segment_id:
            self.dead.add(event.segment_id)

    def next_route(self, drone: DroneState, speed_mps: float = 10, landing_min: float = 3) -> list[Waypoint] | None:
        """Fly from the current position to the far end of the current line, then keep following
        adjacent (not yet visited, not dead) lines until the battery budget is used up."""
        if drone.status == "charging" and drone.battery_min < MIN_TAKEOFF_BATTERY_MIN:
            return None
        budget_m = (drone.battery_min - landing_min - RESERVE_MIN) * 60 * speed_mps
        if budget_m <= 0 or drone.segment_id not in self.segs:
            return None
        visited = self.visited.setdefault(drone.drone_id, set())
        sid, pos = drone.segment_id, drone.position
        coords = self.segs[sid]["geometry"]["coordinates"]
        # head to the farther end of the current line
        if dist_m(pos, coords[0]) > dist_m(pos, coords[-1]):
            coords = coords[::-1]
        route = [Waypoint(position=pos, segment_id=sid)]
        route_len = 0.0
        nearest = min(range(len(coords)), key=lambda i: dist_m(pos, coords[i]))
        coords = coords[nearest:]
        while True:
            visited.add(sid)
            for c in coords:
                d = dist_m(route[-1].position, c)
                if route_len + d > budget_m:
                    return route if len(route) > 1 else None
                route_len += d
                route.append(Waypoint(position=c, segment_id=sid))
            nxt = self._next_segment(sid, route[-1].position, visited)
            if nxt is None:
                return route if len(route) > 1 else None
            sid = nxt
            coords = self.segs[sid]["geometry"]["coordinates"]
            if dist_m(route[-1].position, coords[0]) > dist_m(route[-1].position, coords[-1]):
                coords = coords[::-1]

    def _next_segment(self, sid: str, end: list[float], visited: set[str]) -> str | None:
        p = self.segs[sid]["properties"]
        end_node = min((p["from_node"], [p["from_connection_lon"], p["from_connection_lat"]]),
                       (p["to_node"], [p["to_connection_lon"], p["to_connection_lat"]]),
                       key=lambda nc: dist_m(end, nc[1]))[0]
        options = [s for s, f in self.segs.items() if s != sid and s not in self.dead
                   and end_node in (f["properties"]["from_node"], f["properties"]["to_node"])]
        fresh = [s for s in options if s not in visited]
        return (fresh or [None])[0]

    def cell_states(self) -> list[CellState]:
        return [CellState(cell_id=c, risk=r) for c, r in self.risk.items()]

    def segment_states(self) -> list[SegmentState]:
        return [SegmentState(segment_id=s, p_live=0.0 if s in self.dead else P_LIVE_PRIOR) for s in self.segs]
