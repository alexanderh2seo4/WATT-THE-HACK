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
- Sim model (`backend/app/sim/sensors.py`): every cell a drone enters while flying along a line is one air pass; landing inspects only the cell under the drone. Per pass and fault type: a true fault is detected with `p_detect_air` / `p_detect_landed`, otherwise a false positive appears with `p_false_positive`. A fault type with `p_detect_air = 0` is landed-only (galloping in the default scenario).
- The sensor reports its own confidence: true detections 0.6–0.95 from the air, 0.85–0.99 landed; false positives 0.3–0.7. The planner's Bayes update mixes posterior and prior by this confidence, so a shaky single detection lands in "needs confirmation" (0.4–0.8) rather than "send crew".
- Proposed 50 Hz magnetometer: one live/dead reading per segment per flight, correct with p = 0.9. The current sensor on landing always gives the truth.
- Sensor and drone specs (`SimConfig.sensors`, `SimConfig.drone`) are treated as known to the planner (calibration data). Fault locations and dead lines are not.
- False-positive rates in the default scenario are low (0.2–0.5 % per cell pass and fault type) so the log is not flooded.

## Grid / data
- Lines are split into ~500 m cells. Risk and coverage are tracked per cell.
- The operator can mark lines as known dead. LINE_024 is pre-filled (report 03). Operator knowledge is assumed correct, so the sim treats these lines as dead too.
- A line's live/dead status is unknown until a drone lands on it or we get a report. Prior `p_live` = 0.9.
- Vegetation comes from a one-off OSM Overpass export (forest, wood, tree rows) and is stored offline.
- Simulation length: open-ended (pause/stop manually). `scenario_window_hours: 4` in the config is unexplained; check with the organisers.
- Cells: each line is cut into `n = max(1, round(length / 500 m))` equal pieces (418 cells). `cell_id = "LINE_001#03"` with a 0-based, 2-digit index. Short lines (< 250 m) are one cell. Distances use a local equirectangular projection around the study-area centre (error well below 1 %).

## Report mapping (default operator inputs)
Report polygon = `location_area_coordinates`. Report text = `description`. Textual confidence → number: low 0.2, low to medium 0.35, medium 0.5, medium to high 0.65, high 0.8. For compound texts ("high that an event was logged; low for its location") we use the location/asset-level part, so reports 01 and 03 get 0.2.

| Report | information_type | fault_types | confidence |
|---|---|---|---|
| 01 | weather_alert | vegetation, galloping, broken_conductor | 0.2 |
| 02 | vegetation_and_access_report | vegetation | 0.35 |
| 03 | protection_event_summary | broken_conductor, vegetation | 0.2 |
| 04 | visual_flash_report | hotspot, broken_conductor | 0.35 |
| 05 | sound_and_warmth_report | hotspot | 0.35 |
| 06 | conductor_motion_report | galloping, sag | 0.2 |

## Simulation (M1)
- Sim time advances in 1 s steps; one HTTP poll advances `wall time × speed` (default speed 60×). Same `seed` ⇒ same run.
- Charging drones ask the planner for a route every 60 sim-s. Placeholder rule: take off once battery ≥ min(20 min, what the next full route needs incl. landing + 5 min reserve).
- M1 routing (DumbPlanner): transit to the nearest line with uninspected cells (or a finding that needs confirmation), fly along it, repeat while the battery allows; end on a line not known to be dead (`p_live ≥ 0.5`), else add a hop to the nearest such line. Drones don't take lines another drone is currently flying.
- A dead line (landing or operator) adds 0.2 risk to each of its cells (placeholder).
- Recommendations (§4.5) are emitted once per cell / segment / report: risk > 0.8 with a finding → send crew; 0.4–0.8 with a finding → needs confirmation; dead line fully inspected without finding → inspect from ground; all cells of a report area inspected and < 0.4 → area cleared.
- Default ground truth (`backend/scenarios/default.json`): hidden dead line LINE_036; faults: vegetation on LINE_026 (report 02 area), hotspot on LINE_002 (report 05 area), galloping on LINE_039 (report 06 area), vegetation on LINE_035 (outside the specific report areas 02–06; report 01 covers the whole region; picked without the vegetation layer, which is not in the repo yet). Galloping is landed-only (`p_detect_air = 0`). Sensor probabilities there are guesses; hotspot assumes the extra thermal camera.

## Bundesnetzagentur historical data

Detailed interruption records are present here for 2012–2024. The agency's currently linked incident workbooks cover 2013–2024; only 2012 could be recovered from the archived download. Do not interpret unavailable incident years (2006–2011) as zero incidents. The nationwide indicator series covers 2006–2024, and state-level SAIDI values cover 2008 onward. See `resources/bundesnetzagentur_strom/README.md` for sources and recovery details.

The analysis script counts reported rows, not unique physical faults: meter replacements can be bulk reports and upstream faults can appear in several networks. Percentages pool records across available years, with all-record and unplanned populations kept separate. Impact uses the supplied restoration-stage integrals, not duration multiplied by initial impact. LV customer counts/minutes, MV transformer MVA/minutes and HV/EHV MW/minutes remain separate; ambiguous voltage combinations receive no inferred units. Missing/negative values are unavailable for the affected metric, and records are retained in count denominators. The published national PDF is authoritative for reliability indices; its archived workbook is checked, not added. State indices approximate geography using operator registration. Weather categories are not storm-only probabilities or fault-location priors for the fictional grid.

## Geolocated outage feed examples

`resources/outage_location_examples/` holds point snapshots from British operator feeds captured on 24 October 2026. These are more localized than the German event records, but their published points are not guaranteed fault-asset coordinates. They cover Great Britain, are current-feed snapshots rather than historical archives, and must not be treated as observations about the Bavaria scenario. See that folder's README for dates, licenses, attribution, and source links.
