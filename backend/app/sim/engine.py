"""On-demand simulation (PLAN.md §2, choices 3+4).

No background thread: every `advance()` (called on GET /api/state) steps the sim forward by
`wall time since last call × speed` in fixed 1 s sim steps. Seeded RNG => same config, same run.
The sim knows the ground truth (SimConfig); the planner only sees Events.
"""

import random
import time
from typing import Callable

from app.geo import dist_m, heading_deg, lerp
from app.models import (DroneState, Event, OperatorInputs, SimConfig, StartPosition, State, Static, Waypoint)
from app.planner import Planner

DT = 1.0  # sim seconds per step
MAX_STEPS_PER_CALL = 6 * 3600  # don't hang if the tab was asleep for a long time
N_DRONES = 5
ASK_PLANNER_EVERY_S = 60  # charging drones ask the planner for a route this often


class Drone:
    def __init__(self, sp: StartPosition, battery_min: float):
        self.id = sp.drone_id
        self.position = list(sp.position)
        self.segment_id: str | None = sp.segment_id
        self.heading = 0.0
        self.status = "charging"
        self.battery_min = battery_min
        self.route: list[Waypoint] = []
        self.leg = 0  # index of the waypoint we are flying towards
        self.landing_left_s = 0.0

    def state(self) -> DroneState:
        remaining = [self.position] + [w.position for w in self.route[self.leg:]] if self.route else []
        return DroneState(drone_id=self.id, position=self.position, heading=round(self.heading, 1),
                          status=self.status, battery_min=round(self.battery_min, 2),
                          segment_id=self.segment_id, route=remaining)


class Engine:
    def __init__(self, static: Static, config: SimConfig, planner_factory: Callable[[Static], Planner]):
        self.static = static
        self.config = config
        self.planner_factory = planner_factory
        self.inputs: OperatorInputs = static.default_inputs
        self.speed = 60.0
        self.start_positions: list[StartPosition] = []
        self.reset()

    # ---------- control ----------

    def reset(self) -> None:
        self.t = 0.0
        self.status = "setup"
        self.events: list[Event] = []
        self.rng = random.Random(self.config.seed)
        self.planner = self.planner_factory(self.static)
        self.planner.set_inputs(self.inputs)
        self._place_drones()
        self._last_wall: float | None = None
        self._carry = 0.0

    def set_inputs(self, inputs: OperatorInputs) -> None:
        self.inputs = inputs
        self.planner.set_inputs(inputs)

    def set_config(self, config: SimConfig) -> None:
        self.config = config
        self.reset()

    def plan_start_positions(self) -> list[StartPosition]:
        self.start_positions = self.planner.start_positions(N_DRONES)
        if self.status == "setup":
            self._place_drones()
        return self.start_positions

    def control(self, action: str, speed: float | None = None) -> None:
        if speed is not None:
            self.advance()  # bank time at the old speed first
            self.speed = speed
        if action == "start" and self.status == "setup":
            if not self.start_positions:
                self.plan_start_positions()
            self.status = "running"
            self._last_wall = time.monotonic()
        elif action == "pause" and self.status == "running":
            self.advance()
            self.status = "paused"
        elif action == "resume" and self.status == "paused":
            self.status = "running"
            self._last_wall = time.monotonic()
        elif action == "reset":
            self.reset()

    # ---------- stepping ----------

    def advance(self) -> None:
        """Advance by elapsed wall time × speed (only while running)."""
        if self.status != "running":
            return
        now = time.monotonic()
        self._carry += (now - (self._last_wall or now)) * self.speed
        self._last_wall = now
        n = min(int(self._carry / DT), MAX_STEPS_PER_CALL)
        self._carry -= n * DT
        self.step_n(n)

    def step_n(self, n: int) -> None:
        for _ in range(n):
            self._step()

    def _step(self) -> None:
        self.t += DT
        for d in self.drones:
            if d.status == "flying":
                self._fly(d)
            elif d.status == "landing":
                d.battery_min = max(0.0, d.battery_min - DT / 60)
                d.landing_left_s -= DT
                if d.landing_left_s <= 0:
                    self._landed(d)
            elif d.status == "charging":
                p = self.config.drone
                if not self._is_dead(d.segment_id):  # no charging on a dead line
                    d.battery_min = min(p.max_flight_min, d.battery_min + DT / 60 * p.max_flight_min / p.full_charge_min)
                if (self.t - DT) % ASK_PLANNER_EVERY_S == 0:  # planner decides whether it is worth flying now
                    self._try_takeoff(d)

    def _try_takeoff(self, d: Drone) -> None:
        p = self.config.drone
        route = self.planner.next_route(d.state(), p.speed_inspect_mps, p.landing_min)
        if not route:
            return
        d.route, d.leg, d.status = route, 1, "flying"
        self._emit("takeoff", d, f"{d.id} takes off from {d.segment_id}")

    def _fly(self, d: Drone) -> None:
        p = self.config.drone
        d.battery_min = max(0.0, d.battery_min - DT / 60)
        budget = DT
        while budget > 0 and d.leg < len(d.route):
            wp = d.route[d.leg]
            speed = p.speed_inspect_mps if wp.segment_id else p.speed_transit_mps
            dist = dist_m(d.position, wp.position)
            if dist > 1e-6:
                d.heading = heading_deg(d.position, wp.position)
            if dist <= speed * budget:
                budget -= dist / speed
                d.position = list(wp.position)
                d.segment_id = wp.segment_id
                d.leg += 1
            else:
                d.position = lerp(d.position, wp.position, speed * budget / dist)
                d.segment_id = wp.segment_id
                budget = 0
        if d.leg >= len(d.route):
            d.status, d.landing_left_s = "landing", p.landing_min * 60
            d.route, d.leg = [], 0
        elif d.battery_min <= 0:
            d.status = "stranded"
            self._emit("stranded", d, f"{d.id} ran out of battery")

    def _landed(self, d: Drone) -> None:
        self._emit("landing", d, f"{d.id} landed on {d.segment_id}")
        if not self._is_dead(d.segment_id):
            d.status = "charging"
            return
        self._emit("line_dead", d, f"{d.id}: no current on {d.segment_id} - line is dead, cannot charge")
        if d.battery_min > self.config.drone.landing_min:
            self._try_takeoff(d)  # hop on with the reserve (status is still "landing" here)
        if d.status == "landing":
            d.status = "stranded"
            self._emit("stranded", d, f"{d.id} is stranded on dead line {d.segment_id}")

    # ---------- helpers ----------

    def _is_dead(self, segment_id: str | None) -> bool:
        return segment_id in self.config.dead_segments or segment_id in self.inputs.known_dead_segments

    def _place_drones(self) -> None:
        self.drones = [Drone(sp, self.config.drone.start_battery_min) for sp in self.start_positions]

    def _emit(self, type_: str, d: Drone, message: str, **kw) -> None:
        ev = Event(t=self.t, type=type_, drone_id=d.id, segment_id=d.segment_id, position=list(d.position),
                   message=message, **kw)
        self.events.append(ev)
        self.planner.on_event(ev)

    def state(self) -> State:
        return State(t=self.t, speed=self.speed, status=self.status, drones=[d.state() for d in self.drones],
                     cells=self.planner.cell_states(), segments=self.planner.segment_states(),
                     inputs=self.inputs, start_positions=self.start_positions, events=self.events)
