# Assumptions

Draft values (see PLAN.md). Change them here when the team decides.

## Drone
- Transit speed 16 m/s (Nomad website). Inspection speed along a line: 10 m/s (assumed, so the camera can see).
- One flight ≤ 30 min. Landing/docking takes 3 min and counts as flight time (website: "under 5 min").
- Charging is linear: 180 min for a full 30 min. Partial charges allowed.
- All drones start with a full battery, already docked on a live line chosen by the planner.
- A drone keeps a 5 min reserve so it can hop to another line if its landing line turns out to be dead.
- A drone landed on a dead line with no reserve is `stranded` (out of the game).
- Drones may fly cross-country in straight lines at transit speed. They only inspect while flying along a line.
- Wind is ignored: no flight ban above 36 km/h gusts and no effect on speed or battery (limitation).

## Sensors
- Camera, thermal, acoustic: work during flight along the line (per cell, probabilistic).
- Current, sag (IMU), vibration, conductor temperature: only when landed, only for the span where the drone sits.
- Current ≈ 0 on landing ⇒ line is dead ⇒ no charging.

## Grid / data
- Lines are split into ~500 m cells. Risk and coverage are tracked per cell.
- The operator can mark lines as known dead. LINE_024 is pre-filled (report 03). Operator knowledge is assumed correct, so the sim treats these lines as dead too.
- A line's live/dead status is unknown until a drone lands on it or we get a report. Prior `p_live` = 0.9.
- Vegetation comes from a one-off OSM Overpass export (forest, wood, tree rows) and is stored offline.
- Simulation length: open-ended (pause/stop manually). `scenario_window_hours: 4` in the config is unexplained; check with the organisers.
