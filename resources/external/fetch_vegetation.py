"""One-off export of OSM vegetation (forest, wood, tree rows) near the grid.

Usage:  python3 resources/external/fetch_vegetation.py
Output: resources/external/vegetation.geojson

Stdlib only. Queries Overpass for landuse=forest, natural=wood (ways + multipolygon
relations) and natural=tree_row (ways) inside the study bounds, keeps only features
within KEEP_DIST_M of a grid line, simplifies them (Douglas-Peucker) and writes GeoJSON.
Data (c) OpenStreetMap contributors, ODbL 1.0.
"""

import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
GRID = HERE.parent / "grid_segments.geojson"
OUT = HERE / "vegetation.geojson"

WEST, SOUTH, EAST, NORTH = 10.45, 48.09, 10.88, 48.38
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
KEEP_DIST_M = 200.0
SIMPLIFY_M = 5.0
SAMPLE_STEP_M = 50.0

# Local equirectangular projection (good enough for a ~30 km study area).
LAT0 = (SOUTH + NORTH) / 2
MX = 111_320.0 * math.cos(math.radians(LAT0))
MY = 110_540.0


def proj(lon, lat):
    return (lon * MX, lat * MY)


def query():
    bbox = f"{SOUTH},{WEST},{NORTH},{EAST}"
    q = f"""
[out:json][timeout:180];
(
  way["landuse"="forest"]({bbox});
  way["natural"="wood"]({bbox});
  way["natural"="tree_row"]({bbox});
  relation["landuse"="forest"]["type"="multipolygon"]({bbox});
  relation["natural"="wood"]["type"="multipolygon"]({bbox});
);
out geom;
"""
    data = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "drone-hackathon/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def join_rings(ways):
    """Join open way pieces (lists of (lon,lat)) into closed rings."""
    rings, open_ = [], [list(w) for w in ways if len(w) >= 2]
    while open_:
        cur = open_.pop()
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(open_):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                open_.pop(i)
                changed = True
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


def kind(tags):
    if tags.get("natural") == "tree_row":
        return "tree_row"
    return "forest" if tags.get("landuse") == "forest" else "wood"


def to_features(osm):
    """Yield (kind, osm_id, geometry-type, coords) with coords as lists of (lon,lat)."""
    for el in osm["elements"]:
        tags = el.get("tags", {})
        if el["type"] == "way" and "geometry" in el:
            pts = [(p["lon"], p["lat"]) for p in el["geometry"]]
            k = kind(tags)
            if k == "tree_row" or pts[0] != pts[-1] or len(pts) < 4:
                yield k, f"way/{el['id']}", "LineString", pts
            else:
                yield k, f"way/{el['id']}", "Polygon", [pts]
        elif el["type"] == "relation":
            outer = [[(p["lon"], p["lat"]) for p in m["geometry"]]
                     for m in el.get("members", []) if m.get("role") == "outer" and "geometry" in m]
            inner = [[(p["lon"], p["lat"]) for p in m["geometry"]]
                     for m in el.get("members", []) if m.get("role") == "inner" and "geometry" in m]
            outers, inners = join_rings(outer), join_rings(inner)
            if outers:
                # Simplification: holes are attached to the first outer ring only.
                polys = [[outers[0]] + inners] + [[r] for r in outers[1:]]
                yield kind(tags), f"relation/{el['id']}", "MultiPolygon", polys


# --- distance filter ------------------------------------------------------

def grid_samples():
    pts = []
    for f in json.load(open(GRID))["features"]:
        g = f["geometry"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        for line in lines:
            for (a, b) in zip(line, line[1:]):
                pa, pb = proj(*a), proj(*b)
                n = max(1, int(math.dist(pa, pb) / SAMPLE_STEP_M))
                for i in range(n + 1):
                    t = i / n
                    pts.append((pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1])))
    return pts


class Hash:
    def __init__(self, pts, cell=KEEP_DIST_M):
        self.cell, self.h = cell, {}
        for p in pts:
            self.h.setdefault((int(p[0] // cell), int(p[1] // cell)), []).append(p)

    def in_box(self, x0, y0, x1, y1):
        c = self.cell
        for i in range(int(x0 // c), int(x1 // c) + 1):
            for j in range(int(y0 // c), int(y1 // c) + 1):
                for p in self.h.get((i, j), ()):
                    if x0 <= p[0] <= x1 and y0 <= p[1] <= y1:
                        yield p


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def inside(p, ring):
    x, y, c = p[0], p[1], False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def near_grid(lines_m, outer_rings_m, idx):
    xs = [p[0] for l in lines_m for p in l]
    ys = [p[1] for l in lines_m for p in l]
    d = KEEP_DIST_M
    cand = list(idx.in_box(min(xs) - d, min(ys) - d, max(xs) + d, max(ys) + d))
    for p in cand:
        if any(inside(p, r) for r in outer_rings_m):
            return True
        for l in lines_m:
            if any(seg_dist(p, a, b) <= d for a, b in zip(l, l[1:])):
                return True
    return False


def simplify(pts, tol):
    """Douglas-Peucker on projected points; returns kept indices."""
    keep = {0, len(pts) - 1}
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, bi = 0.0, None
        for k in range(i + 1, j):
            dk = seg_dist(pts[k], pts[i], pts[j])
            if dk > best:
                best, bi = dk, k
        if bi is not None and best > tol:
            keep.add(bi)
            stack += [(i, bi), (bi, j)]
    return sorted(keep)


def simp_line(ll, closed):
    m = [proj(*p) for p in ll]
    if closed and len(m) > 4:
        # split closed ring at the farthest point so DP doesn't collapse it
        far = max(range(len(m)), key=lambda k: math.dist(m[0], m[k]))
        idx = simplify(m[: far + 1], SIMPLIFY_M) + [far + k for k in simplify(m[far:], SIMPLIFY_M)[1:]]
    else:
        idx = simplify(m, SIMPLIFY_M)
    out = [[round(ll[k][0], 6), round(ll[k][1], 6)] for k in idx]
    return out if (not closed or len(out) >= 4) else None


def main():
    print("querying Overpass ...")
    osm = query()
    print(f"{len(osm['elements'])} OSM elements")
    idx = Hash(grid_samples())
    feats = []
    for k, osm_id, gtype, coords in to_features(osm):
        if gtype == "LineString":
            lines, outers = [coords], []
        elif gtype == "Polygon":
            lines, outers = coords, [coords[0]]
        else:
            lines = [r for poly in coords for r in poly]
            outers = [poly[0] for poly in coords]
        if not near_grid([[proj(*p) for p in l] for l in lines], [[proj(*p) for p in r] for r in outers], idx):
            continue
        if gtype == "LineString":
            geom = simp_line(coords, False)
        elif gtype == "Polygon":
            rings = [r for r in (simp_line(r, True) for r in coords) if r]
            geom = rings if rings and rings[0] == simp_line(coords[0], True) else None
        else:
            polys = []
            for poly in coords:
                rings = [simp_line(r, True) for r in poly]
                if rings[0]:
                    polys.append([r for r in rings if r])
            geom = polys or None
        if not geom:
            continue
        feats.append({"type": "Feature", "properties": {"osm_id": osm_id, "kind": k},
                      "geometry": {"type": gtype, "coordinates": geom}})
    fc = {"type": "FeatureCollection",
          "properties": {"source": "OpenStreetMap via Overpass", "license": "ODbL 1.0, (c) OpenStreetMap contributors",
                         "bounds": [WEST, SOUTH, EAST, NORTH], "kept_within_m_of_grid": KEEP_DIST_M,
                         "simplify_tolerance_m": SIMPLIFY_M},
          "features": feats}
    OUT.write_text(json.dumps(fc, separators=(",", ":")))
    print(f"wrote {len(feats)} features, {OUT.stat().st_size / 1e6:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
