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
