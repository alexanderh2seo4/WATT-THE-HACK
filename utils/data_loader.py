import json
import pandas as pd
import geopandas as gpd

PKG = "participant_package"


def load_all(pkg=PKG):
    segments = gpd.read_file(f"{pkg}/grid_segments.geojson")
    segments["kind"] = "segment"
    segments["id"] = segments["segment_id"]

    nodes = gpd.read_file(f"{pkg}/grid_nodes.geojson")
    nodes["kind"] = "node"
    nodes["id"] = nodes["node_id"]

    context = gpd.read_file(f"{pkg}/scenario_context.geojson")
    context["kind"] = context["context_kind"].map(
        {"synthetic_storm_footprint": "storm", "synthetic_report_area": "report_area"}
    )
    context["id"] = context["context_id"]

    cfg = json.load(open(f"{pkg}/scenario_public_config.json"))
    reports = pd.DataFrame(cfg["public_context"]["reports"])
    reports = reports.drop(columns=["location_area_coordinates", "information_type", "source"])
    context = context.merge(reports, on="information_id", how="left")

    return pd.concat([segments, nodes, context], ignore_index=True)


GREEN_TAGS = [
    ("landuse", "forest"), ("natural", "wood"), ("natural", "scrub"), ("natural", "heath"),
    ("landuse", "grass"), ("landuse", "meadow"), ("landuse", "orchard"), ("landuse", "village_green"),
    ("landuse", "recreation_ground"), ("leisure", "park"), ("leisure", "garden"),
    ("leisure", "nature_reserve"),
]


def _relation_polygons(el):
    """Assemble a multipolygon relation from its member way geometries."""
    from shapely.geometry import LineString
    from shapely.ops import polygonize, unary_union

    def rings(role):
        lines = [
            LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
            for m in el.get("members", [])
            if m["type"] == "way" and m["role"] == role and len(m.get("geometry", [])) >= 2
        ]
        return list(polygonize(unary_union(lines))) if lines else []

    outer, inner = rings("outer"), rings("inner")
    if not outer:
        return []
    poly = unary_union(outer)
    if inner:
        poly = poly.difference(unary_union(inner))
    return [poly]


def load_forest(bounds, cache=f"{PKG}/green_areas.geojson"):
    """Green areas as in the OSM standard style (forest, wood, scrub, grass, parks, ...) within bounds
    (minx, miny, maxx, maxy). Includes multipolygon relations, where most large forests live."""
    import os
    import requests
    from shapely.geometry import Polygon

    if os.path.exists(cache):
        return gpd.read_file(cache)
    minx, miny, maxx, maxy = bounds
    box = f"({miny},{minx},{maxy},{maxx})"
    body = "".join(f'{t}["{k}"="{v}"]{box};' for k, v in GREEN_TAGS for t in ("way", "relation"))
    query = f"[out:json][timeout:180];({body});out geom;"
    resp = requests.post(
        "https://overpass-api.de/api/interpreter", data={"data": query},
        headers={"User-Agent": "watt-the-hack"}, timeout=240,
    )
    resp.raise_for_status()
    polys = []
    for el in resp.json()["elements"]:
        if el["type"] == "relation":
            polys += _relation_polygons(el)
        elif len(el.get("geometry", [])) >= 4 and el["geometry"][0] == el["geometry"][-1]:
            polys.append(Polygon([(p["lon"], p["lat"]) for p in el["geometry"]]))
    forest = gpd.GeoDataFrame(geometry=polys, crs="EPSG:4326")
    forest["geometry"] = forest.geometry.make_valid()
    forest["kind"] = "forest"
    forest.to_file(cache, driver="GeoJSON")
    return forest
