"""Normalized activity route models for TrainVault.

Raw Garmin activity detail payloads never cross the bridge boundary. Only the
bounded route geometry required for the private in-app trace is exposed.
"""

from __future__ import annotations

from pydantic import Field

from .models import ApiModel


class ActivityRoutePoint(ApiModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    elevation_meters: float | None = None
    distance_meters: float | None = None
    time_ms: int | None = None


class ActivityRouteBounds(ApiModel):
    min_lat: float = Field(ge=-90, le=90)
    max_lat: float = Field(ge=-90, le=90)
    min_lon: float = Field(ge=-180, le=180)
    max_lon: float = Field(ge=-180, le=180)


class ActivityRouteResponse(ApiModel):
    activity_id: str
    points: list[ActivityRoutePoint] = Field(default_factory=list, max_length=1_500)
    bounds: ActivityRouteBounds | None = None
