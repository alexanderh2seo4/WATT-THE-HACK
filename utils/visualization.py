import folium

VOLTAGE_COLORS = {380: "red", 220: "orange", 110: "blue"}


def popup(row, skip=("geometry", "kind")):
    rows = [f"<b>{k}</b>: {v}" for k, v in row.items() if k not in skip]
    return folium.Popup("<br>".join(rows), max_width=400)


def show_map(gdf):
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

    folium.LayerControl().add_to(m)
    return m
