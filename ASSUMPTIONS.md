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

## Bundesnetzagentur historical data

Detailed interruption records are present here for 2012–2024. The agency's currently linked incident workbooks cover 2013–2024; only 2012 could be recovered from the archived download. Do not interpret unavailable incident years (2006–2011) as zero incidents. The nationwide indicator series covers 2006–2024, and state-level SAIDI values cover 2008 onward. See `resources/bundesnetzagentur_strom/README.md` for sources and recovery details.

The analysis script counts reported rows, not unique physical faults: meter replacements can be bulk reports and upstream faults can appear in several networks. Percentages pool records across available years, with all-record and unplanned populations kept separate. Impact uses the supplied restoration-stage integrals, not duration multiplied by initial impact. LV customer counts/minutes, MV transformer MVA/minutes and HV/EHV MW/minutes remain separate; ambiguous voltage combinations receive no inferred units. Missing/negative values are unavailable for the affected metric, and records are retained in count denominators. The published national PDF is authoritative for reliability indices; its archived workbook is checked, not added. State indices approximate geography using operator registration. Weather categories are not storm-only probabilities or fault-location priors for the fictional grid.

## Geolocated outage feed examples

`resources/outage_location_examples/` holds point snapshots from British operator feeds captured on 24 October 2026. These are more localized than the German event records, but their published points are not guaranteed fault-asset coordinates. They cover Great Britain, are current-feed snapshots rather than historical archives, and must not be treated as observations about the Bavaria scenario. See that folder's README for dates, licenses, attribution, and source links.
