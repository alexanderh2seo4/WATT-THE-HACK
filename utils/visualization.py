import folium
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

VOLTAGE_COLORS = {380: "red", 220: "orange", 110: "blue"}


def popup(row, skip=("geometry", "kind")):
    rows = [f"<b>{k}</b>: {v}" for k, v in row.items() if k not in skip]
    return folium.Popup("<br>".join(rows), max_width=400)


def show_map(gdf, layer_control=True):
    m = folium.Map(control_scale=True)
    m.fit_bounds([[gdf.total_bounds[1], gdf.total_bounds[0]], [gdf.total_bounds[3], gdf.total_bounds[2]]])
    folium.TileLayer("OpenStreetMap").add_to(m)

    # storm and report areas
    for kind, color in [("storm", "gray"), ("report_area", "purple")]:
        layer = folium.FeatureGroup(kind)
        for _, r in gdf[gdf.kind == kind].iterrows():
            folium.GeoJson(
                r.geometry, style_function=lambda _, c=color: {"color": c, "weight": 1, "fillOpacity": 0.08},
                tooltip=r["label"], popup=popup(r.dropna()),
            ).add_to(layer)
        layer.add_to(m)

    # line segments, colored by voltage
    layer = folium.FeatureGroup("segments")
    for _, r in gdf[gdf.kind == "segment"].iterrows():
        folium.GeoJson(
            r.geometry, style_function=lambda _, c=VOLTAGE_COLORS.get(r.voltage_kv, "black"): {"color": c, "weight": 3},
            tooltip=f"{r.id} ({r.voltage_kv} kV)", popup=popup(r.dropna()),
        ).add_to(layer)
    layer.add_to(m)

    # nodes
    layer = folium.FeatureGroup("nodes")
    for _, r in gdf[gdf.kind == "node"].iterrows():
        folium.CircleMarker(
            [r.geometry.y, r.geometry.x], radius=4, color="black", fill=True,
            fill_color="yellow" if "substation" in r.node_type else "white",
            tooltip=r["name"] if isinstance(r["name"], str) else r.id, popup=popup(r.dropna()),
        ).add_to(layer)
    layer.add_to(m)

    if layer_control:
        folium.LayerControl().add_to(m)
    return m


def forest_heat_overlay(forest, decay_km=2.0, bounds=None, cells=600, color=(0.20, 0.60, 0.25)):
    """Heat raster: 1 inside forest, exp(-distance / decay_km) outside."""
    minx, miny, maxx, maxy = bounds if bounds is not None else forest.total_bounds
    # rasterize with PIL (north-up); testing every cell against every polygon is far slower
    img = Image.new("1", (cells, cells), 0)
    draw = ImageDraw.Draw(img)
    sx, sy = (cells - 1) / (maxx - minx), (cells - 1) / (maxy - miny)

    def px(coords):
        return [((x - minx) * sx, (maxy - y) * sy) for x, y in coords]

    for geom in forest.geometry:
        for poly in getattr(geom, "geoms", [geom]):
            if poly.geom_type != "Polygon" or poly.is_empty:
                continue
            draw.polygon(px(poly.exterior.coords), fill=1)
            for hole in poly.interiors:
                draw.polygon(px(hole.coords), fill=0)
    inside = np.array(img)
    # cell size in km (equirectangular approximation)
    dy = (maxy - miny) / (cells - 1) * 111.32
    dx = (maxx - minx) / (cells - 1) * 111.32 * np.cos(np.radians((miny + maxy) / 2))
    dist_km = distance_transform_edt(~inside, sampling=(dy, dx))
    heat = np.exp(-dist_km / decay_km)
    rgba = np.zeros(heat.shape + (4,))
    rgba[..., :3] = color
    rgba[..., 3] = np.where(inside, 0.6, 0.45 * heat)  # solid green in forest, fading out with distance
    return rgba, [[miny, minx], [maxy, maxx]]


def show_forest_map(gdf, forest=None, decay_km=2.0):
    """show_map plus a forest heatmap overlay.

    forest: GeoDataFrame of forest polygons (EPSG:4326); defaults to the rows of
    gdf with kind == "forest". decay_km: distance at which the heat falls to 1/e.
    """
    if forest is None:
        forest = gdf[gdf.kind == "forest"]
    m = show_map(gdf, layer_control=False)
    if len(forest):
        b = gdf.total_bounds
        rgba, bounds = forest_heat_overlay(forest, decay_km, bounds=b)
        folium.raster_layers.ImageOverlay(
            rgba, bounds=bounds, name=f"forest heat (decay {decay_km} km)", opacity=1, zindex=2,
        ).add_to(m)
    folium.LayerControl().add_to(m)
    return m
