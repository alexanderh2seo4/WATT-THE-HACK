# AGENTS.md

## Context: this is a hackathon

We are building a **working prototype**, not a perfect product. Speed and a clear, demonstrable idea matter more than completeness. The prototype does not need to handle every edge case.

Guiding principles:

- **Main path first.** Make the core flow work end to end, then stop polishing.
- **Keep it simple.** Prefer the smallest solution that demonstrates the idea. No speculative abstractions, no premature optimization, no extra configurability.
- **Edge cases are optional.** Handle one only if it would visibly break the demo. Otherwise skip it (a short `# TODO` or a note in the limitations is enough).
- **Hardcoding and shortcuts are fine** if they speed up the demo, as long as the assumptions are stated.
- **STATE ASSUMPTIONS**. Additional assumptions about the resources (e.g. flight speed...) should be added to @ASSUMPTIONS.md
- **Don't over-engineer error handling**, validation or logging.

## The challenge

The challenge description is as follows: 

In short: after a storm, five mobile sensor packages (30 min flight, 3 h charge, charge only on a live line) help a grid operator decide where to investigate first, how to adapt as findings come in, and when there is enough evidence to recommend an inspection or repair. We pick one problem (or a small combination), and demonstrate the approach with the supplied dataset through a small tool, map, simulation, slides, etc. A useful, well-thought-through solution matters more than a complete application.

A detailed version can be found here if required: [`TASK.md`](./TASK.md).

## Resources

All provided data is in [`resources/`](./resources). Start with `resources/README.md`, which explains the files and what the data can and cannot tell you.

| File | Content |
|---|---|
| `README.md` | How to use the files; limitations of the data |
| `network_map.png` | Overview map |
| `grid_segments.csv` / `.geojson` | 64 line sections (`segment_id`, e.g. `LINE_001`) |
| `grid_nodes.csv` / `.geojson` | 59 nodes (`node_id`): line ends, connections, substations |
| `initial_information.csv` | Six fictional, possibly misleading storm reports |
| `scenario_context.geojson` | Storm area and broad report areas (not exact locations) |
| `scenario_public_config.json` | Public scenario settings and report text |

Data caveats to respect (see `resources/README.md` for the full list):

- Reports are hints for where to begin, not confirmed fault locations.
- Lines crossing on the map are not necessarily connected. Several lines entering a substation do not prove they connect inside it.
- The files do not show power flow, customer supply or which lines are live. Component groups are not outage areas.

## Testing

- Test **only the main functionality** (the happy path of the core flow, such as loading the data, computing a plan, or running the simulation).
- A few quick smoke tests are enough. Do not aim for coverage.
- **Do not write tests for edge cases**, malformed input, or unlikely failure modes.
- If a test is slow or fiddly to maintain, drop it. Don't spend time on test infrastructure.

## Reviewing

When reviewing code (as a reviewing agent or otherwise):

- Check only that the **main functionality works** and that **nothing is broken** by the change (crashes, wrong results on the main path, broken demo flow).
- **Do not flag** edge cases, style nits, missing validation, missing tests for rare paths, performance concerns, or "production readiness" issues.
- Keep feedback short and actionable. Report only what would break or undermine the demo.
- When unsure whether something is worth raising, leave it out.

## Working style for agents

- Prefer small, incremental changes that keep the demo runnable at all times but avoid code duplication
- Reuse the provided data as is. Don't build data pipelines we don't need.
- Don't add dependencies unless they clearly save time.
- If a choice is ambiguous, pick the simplest reasonable default, note it briefly, and move on.
- Keep documentation minimal: what it does, how to run it, assumptions and limitations.
