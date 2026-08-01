"""Normalized activity route and analysis models for TrainVault.

Raw Garmin activity payloads never cross the bridge boundary. Only the bounded
summary, geometry, samples and split rows required by TrainVault are exposed.
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


class ActivityAnalysisSummary(ApiModel):
    total_duration_seconds: float | None = Field(default=None, ge=0)
    moving_duration_seconds: float | None = Field(default=None, ge=0)
    elapsed_duration_seconds: float | None = Field(default=None, ge=0)
    run_time_seconds: float | None = Field(default=None, ge=0)
    walk_time_seconds: float | None = Field(default=None, ge=0)
    idle_time_seconds: float | None = Field(default=None, ge=0)
    distance_meters: float | None = Field(default=None, ge=0)
    average_speed_mps: float | None = Field(default=None, ge=0)
    average_moving_speed_mps: float | None = Field(default=None, ge=0)
    max_speed_mps: float | None = Field(default=None, ge=0)
    average_heart_rate_bpm: float | None = Field(default=None, ge=20, le=260)
    max_heart_rate_bpm: float | None = Field(default=None, ge=20, le=260)
    average_cadence_spm: float | None = Field(default=None, ge=0, le=300)
    max_cadence_spm: float | None = Field(default=None, ge=0, le=300)
    elevation_gain_meters: float | None = None
    elevation_loss_meters: float | None = None
    calories: float | None = Field(default=None, ge=0)
    aerobic_training_effect: float | None = Field(default=None, ge=0, le=10)
    anaerobic_training_effect: float | None = Field(default=None, ge=0, le=10)
    minimum_temperature_c: float | None = Field(default=None, ge=-100, le=100)
    maximum_temperature_c: float | None = Field(default=None, ge=-100, le=100)
    primary_benefit: str | None = Field(default=None, max_length=160)


class ActivityAnalysisSample(ApiModel):
    elapsed_seconds: float = Field(ge=0)
    moving_seconds: float | None = Field(default=None, ge=0)
    distance_meters: float | None = Field(default=None, ge=0)
    pace_seconds_per_km: float | None = Field(default=None, gt=0, le=3_600)
    heart_rate_bpm: float | None = Field(default=None, ge=20, le=260)
    cadence_spm: float | None = Field(default=None, ge=0, le=300)
    elevation_meters: float | None = Field(default=None, ge=-500, le=9_000)
    grade_percent: float | None = Field(default=None, ge=-100, le=100)
    temperature_c: float | None = Field(default=None, ge=-100, le=100)


class ActivityAnalysisSplit(ApiModel):
    split_index: int = Field(ge=1)
    split_type: str | None = Field(default=None, max_length=80)
    duration_seconds: float | None = Field(default=None, ge=0)
    moving_duration_seconds: float | None = Field(default=None, ge=0)
    distance_meters: float | None = Field(default=None, ge=0)
    average_pace_seconds_per_km: float | None = Field(default=None, gt=0, le=3_600)
    average_heart_rate_bpm: float | None = Field(default=None, ge=20, le=260)
    max_heart_rate_bpm: float | None = Field(default=None, ge=20, le=260)
    average_cadence_spm: float | None = Field(default=None, ge=0, le=300)
    elevation_gain_meters: float | None = None
    elevation_loss_meters: float | None = None
    calories: float | None = Field(default=None, ge=0)


class ActivityRouteResponse(ApiModel):
    activity_id: str
    summary: ActivityAnalysisSummary = Field(default_factory=ActivityAnalysisSummary)
    points: list[ActivityRoutePoint] = Field(default_factory=list, max_length=1_500)
    bounds: ActivityRouteBounds | None = None
    samples: list[ActivityAnalysisSample] = Field(default_factory=list, max_length=1_200)
    splits: list[ActivityAnalysisSplit] = Field(default_factory=list, max_length=500)
    available_channels: list[str] = Field(default_factory=list, max_length=24)
    source_sample_count: int = Field(default=0, ge=0)
