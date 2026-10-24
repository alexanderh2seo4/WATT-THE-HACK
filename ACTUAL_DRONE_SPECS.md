# Actual Nomadic Drone specs

What the real product ("Nomad" by Nomadic Drones, Munich) is advertised with, taken from the company website. These are **marketing claims, not verified data sheets**. The hackathon rules (30 min flight, 3 h charge, charging only on live lines) take precedence over anything here.

## Hardware

| Spec | Value |
|---|---|
| Total weight | 3.8 kg |
| Wingspan | < 1 m |
| Operating temperature | −25 °C to 50 °C |
| Wind resistance (flight) | 36 km/h |
| Line voltage | Validated on live lines up to 380 kV |
| Docking | Lands on and locks onto the conductor, under 5 minutes; no de-energization needed |
| Charging | Inductive, from the line's electromagnetic field (needs current flowing, not just voltage) |
| Once locked on | Resistant to high winds; shielded against corona discharge and EMI |
| Operations | BVLOS-capable: undock, fly to a new span, re-dock |
| Flight speed / flight time | **Not published** |

Not on the website: press articles report about 2 kg and roughly 2 h recharge, which disagrees with the 3.8 kg above. The website value is used here.

## Sensor suite

| Sensor | Measures | Advertised use |
|---|---|---|
| RGB camera | High-resolution imagery, live feed | Hardware condition, conductor damage (broken strands, corrosion, splices), insulator defects, tower lean, **vegetation encroachment**, wildfire smoke |
| Accelerometers | Conductor vibration | Aeolian vibration, **galloping**, mechanical strain / hardware fatigue |
| Inclinometers / IMU | Line angle → **sag and clearance** | Clearance limits, sag changes from ice or heat |
| Current sensor | Line current | Actual load; overheating components; capacity (dynamic line rating) |
| Conductor temperature | Direct contact temperature of the conductor surface | Overheating, dynamic line rating |
| Gas / smoke detection | Smoke signatures | Wildfire ignition detection (wildfire use-case page only) |
| Ice thickness | Radial ice accretion | Ice monitoring (ice use-case page only) |

Not listed: thermal / infrared camera (the inspection page mentions "visual and thermal analysis" for insulators, but no thermal camera is named), acoustic sensor, lidar.

## Software / data

- Telemetry every **10 seconds**, streamed over a cellular connection.
- Alert thresholds you set yourself for conductor temperature, sag angle, vibration and camera triggers.
- Map view of the drones next to towers, substations and lines; live camera feeds; timeline playback.
- AI-based defect detection on inspection images.
- Wildfire alerts: under a minute to arrive, with GPS coordinates.

## Advertised operating modes

- **Inspection:** flies along the line photographing each tower from a planned list of shots, lands on the line to charge when needed, keeps measuring sag and vibration while charging.
- **Stationary monitoring:** sits on one span for a long time (DLR, ice, wildfire, security).
- **Relocation:** moved remotely from the control room to wherever the risk is (storm fronts, load changes, fire risk).

## Limits that matter for our scenario (our reading)

- Contact temperature, sag, vibration and current are **only measured at the span where the drone sits**. Away from that span, only the camera covers anything, and only during flight.
- Current reading ≈ 0 → line is dead or carries no load, so there's **no charging** on that line.
- No thermal camera or acoustic sensor, so a hot or ticking connection elsewhere (report 05) is only partly detectable.
- Flight in gusts above 36 km/h is not supported.

## Sources

- https://www.nomadicdrone.com/
- https://www.nomadicdrone.com/nomadic-drone
- https://www.nomadicdrone.com/digital-tools
- https://www.nomadicdrone.com/usecases/inspections
- https://www.nomadicdrone.com/usecases/wildfire-detection
- https://www.nomadicdrone.com/usecases/ice-monitoring
- https://www.nomadicdrone.com/usecases/dynamic-line-rating
- https://www.munich-startup.de/en/112350/nomadic-drones-7-questions/
