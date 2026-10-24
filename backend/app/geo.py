"""Tiny geo helpers: local equirectangular projection (metres) around the study area.

Good to well under 1 % over a ~35 km study area, which is plenty for this prototype.
"""

import math

from shapely.geometry.base import BaseGeometry
import shapely

LON0, LAT0 = 10.665, 48.235  # centre of study bounds
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = M_PER_DEG_LAT * math.cos(math.radians(LAT0))


def to_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon - LON0) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT


def to_lonlat(x: float, y: float) -> tuple[float, float]:
    return x / M_PER_DEG_LON + LON0, y / M_PER_DEG_LAT + LAT0


def project(geom: BaseGeometry) -> BaseGeometry:
    return shapely.transform(geom, lambda c: (c - [LON0, LAT0]) * [M_PER_DEG_LON, M_PER_DEG_LAT])


def unproject(geom: BaseGeometry) -> BaseGeometry:
    return shapely.transform(geom, lambda c: c / [M_PER_DEG_LON, M_PER_DEG_LAT] + [LON0, LAT0])


def dist_m(a: list[float], b: list[float]) -> float:
    ax, ay = to_xy(*a)
    bx, by = to_xy(*b)
    return math.hypot(bx - ax, by - ay)


def heading_deg(a: list[float], b: list[float]) -> float:
    """Compass bearing from a to b (0 = north, clockwise)."""
    ax, ay = to_xy(*a)
    bx, by = to_xy(*b)
    return math.degrees(math.atan2(bx - ax, by - ay)) % 360


def lerp(a: list[float], b: list[float], f: float) -> list[float]:
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
