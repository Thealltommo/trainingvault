"""Bounded activity analysis extraction for TrainVault.

Garmin activity details are positional and device-dependent. This module maps
only the summary and channels TrainVault uses into a stable, privacy-preserving
response. Raw Garmin payloads never cross the bridge boundary.
"""

from __future__ import annotations

from collections.abc import Mapping
from math import isfinite
from typing import Any

from garminconnect import parse_activity_detail_metrics

from .route_models import (
    ActivityAnalysisSample,
    ActivityAnalysisSplit,
    ActivityAnalysisSummary,
    ActivityRouteBounds,
    ActivityRoutePoint,
    ActivityRouteResponse,
)

_SAMPLE_LIMIT = 1_200
_ROUTE_LIMIT = 1_500


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if isfinite(parsed) else None


def _integer(value: Any) -> int | None:
    number = _number(value)
    if number is None:
        return None
    return int(number)


def _text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _first(mapping: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        value = mapping.get(key)
        if value is not None:
            return value
    return None


def _seconds(value: Any) -> float | None:
    parsed = _number(value)
    if parsed is None or parsed < 0:
        return None
    # Duration channels are normally seconds. Guard against millisecond payloads.
    return parsed / 1_000 if parsed > 1_000_000 else parsed


def _plausible(value: float | None, minimum: float, maximum: float) -> float | None:
    if value is None or not minimum <= value <= maximum:
        return None
    return value


def _pace_from_speed(value: Any) -> float | None:
    speed = _number(value)
    if speed is None or speed <= 0:
        return None
    return _plausible(1_000 / speed, 90, 3_600)


def _cadence(sample: Mapping[str, Any]) -> float | None:
    doubled = _number(
        _first(
            sample,
            "directDoubleCadence",
            "directRunningCadence",
            "directRunCadence",
        )
    )
    if doubled is not None:
        return _plausible(doubled, 40, 300)

    cadence = _number(_first(sample, "directCadence", "directStepRate"))
    if cadence is None:
        return None
    # Some running devices expose single-leg cadence in directCadence.
    if 35 <= cadence < 120:
        cadence *= 2
    return _plausible(cadence, 40, 300)


def _summary_cadence(value: Any) -> float | None:
    cadence = _number(value)
    if cadence is None:
        return None
    if 35 <= cadence < 100:
        cadence *= 2
    return _plausible(cadence, 0, 300)


def _downsample[T](values: list[T], limit: int) -> list[T]:
    if len(values) <= limit:
        return values
    if limit <= 2:
        return [values[0], values[-1]][:limit]

    result = [values[0]]
    interior = len(values) - 2
    slots = limit - 2
    for slot in range(1, slots + 1):
        index = 1 + round((slot - 1) * (interior - 1) / max(1, slots - 1))
        result.append(values[index])
    result.append(values[-1])
    return result


def _analysis_summary(raw: Mapping[str, Any] | None) -> ActivityAnalysisSummary:
    if raw is None:
        return ActivityAnalysisSummary()

    return ActivityAnalysisSummary(
        total_duration_seconds=_seconds(
            _first(raw, "duration", "durationSeconds", "totalTime")
        ),
        moving_duration_seconds=_seconds(
            _first(raw, "movingDuration", "movingDurationSeconds", "movingTime")
        ),
        elapsed_duration_seconds=_seconds(
            _first(raw, "elapsedDuration", "elapsedDurationSeconds", "elapsedTime")
        ),
        run_time_seconds=_seconds(
            _first(raw, "runTime", "runningTime", "runningDuration")
        ),
        walk_time_seconds=_seconds(
            _first(raw, "walkTime", "walkingTime", "walkingDuration")
        ),
        idle_time_seconds=_seconds(
            _first(raw, "idleTime", "idleDuration", "stoppedTime")
        ),
        distance_meters=_number(_first(raw, "distance", "distanceMeters")),
        average_speed_mps=_number(
            _first(raw, "averageSpeed", "averageSpeedMps")
        ),
        average_moving_speed_mps=_number(
            _first(
                raw,
                "averageMovingSpeed",
                "avgMovingSpeed",
                "averageMovingSpeedMps",
            )
        ),
        max_speed_mps=_number(_first(raw, "maxSpeed", "maximumSpeed", "maxSpeedMps")),
        average_heart_rate_bpm=_plausible(
            _number(_first(raw, "averageHR", "averageHeartRate")), 20, 260
        ),
        max_heart_rate_bpm=_plausible(
            _number(_first(raw, "maxHR", "maxHeartRate")), 20, 260
        ),
        average_cadence_spm=_summary_cadence(
            _first(
                raw,
                "averageRunningCadenceInStepsPerMinute",
                "averageRunCadence",
                "averageRunningCadence",
                "averageCadence",
            )
        ),
        max_cadence_spm=_summary_cadence(
            _first(
                raw,
                "maxRunningCadenceInStepsPerMinute",
                "maxRunCadence",
                "maxRunningCadence",
                "maxCadence",
            )
        ),
        elevation_gain_meters=_number(
            _first(raw, "elevationGain", "elevationGainMeters")
        ),
        elevation_loss_meters=_number(
            _first(raw, "elevationLoss", "elevationLossMeters")
        ),
        calories=_number(raw.get("calories")),
        aerobic_training_effect=_number(
            _first(raw, "aerobicTrainingEffect", "trainingEffect")
        ),
        anaerobic_training_effect=_number(raw.get("anaerobicTrainingEffect")),
        minimum_temperature_c=_plausible(
            _number(_first(raw, "minTemperature", "minimumTemperature")), -100, 100
        ),
        maximum_temperature_c=_plausible(
            _number(_first(raw, "maxTemperature", "maximumTemperature")), -100, 100
        ),
        primary_benefit=_text(
            _first(
                raw,
                "trainingEffectLabel",
                "aerobicTrainingEffectMessage",
                "primaryBenefit",
                "trainingEffectDescription",
            )
        ),
    )


def _route_points(details: Mapping[str, Any]) -> list[ActivityRoutePoint]:
    geo = details.get("geoPolylineDTO")
    if not isinstance(geo, Mapping):
        return []
    polyline = geo.get("polyline")
    if not isinstance(polyline, list):
        return []

    points: list[ActivityRoutePoint] = []
    for item in polyline[:_ROUTE_LIMIT]:
        if not isinstance(item, Mapping):
            continue
        lat = _number(item.get("lat"))
        lon = _number(item.get("lon"))
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        points.append(
            ActivityRoutePoint(
                lat=lat,
                lon=lon,
                elevation_meters=_number(item.get("altitude")),
                distance_meters=_number(item.get("distanceInMeters")),
                time_ms=_integer(item.get("time")),
            )
        )
    return points


def _analysis_samples(details: Mapping[str, Any]) -> tuple[list[ActivityAnalysisSample], int]:
    parsed = parse_activity_detail_metrics(dict(details))
    if not isinstance(parsed, list):
        return [], 0

    base_timestamp_ms: float | None = None
    previous_elapsed = 0.0
    previous_moving = 0.0
    previous_distance = 0.0
    samples: list[ActivityAnalysisSample] = []

    for index, raw in enumerate(parsed):
        if not isinstance(raw, Mapping):
            continue

        timestamp_ms = _number(
            _first(raw, "directTimestamp", "directUtcTimestamp", "timestamp")
        )
        if timestamp_ms is not None and timestamp_ms < 100_000_000_000:
            timestamp_ms *= 1_000
        if base_timestamp_ms is None and timestamp_ms is not None:
            base_timestamp_ms = timestamp_ms

        elapsed = _seconds(
            _first(raw, "sumElapsedDuration", "sumDuration", "elapsedDuration")
        )
        if elapsed is None and timestamp_ms is not None and base_timestamp_ms is not None:
            elapsed = max(0.0, (timestamp_ms - base_timestamp_ms) / 1_000)
        if elapsed is None:
            elapsed = float(index)
        elapsed = max(previous_elapsed, elapsed)
        previous_elapsed = elapsed

        moving = _seconds(_first(raw, "sumMovingDuration", "movingDuration"))
        if moving is not None:
            moving = max(previous_moving, moving)
            previous_moving = moving

        distance = _number(_first(raw, "sumDistance", "directDistance", "distance"))
        if distance is not None:
            if distance < previous_distance:
                distance = previous_distance
            previous_distance = distance

        pace = _pace_from_speed(_first(raw, "directSpeed", "enhancedSpeed", "speed"))
        heart_rate = _plausible(
            _number(_first(raw, "directHeartRate", "heartRate")), 20, 260
        )
        elevation = _plausible(
            _number(
                _first(
                    raw,
                    "directCorrectedElevation",
                    "directElevation",
                    "directAltitude",
                    "altitude",
                )
            ),
            -500,
            9_000,
        )
        grade = _plausible(
            _number(_first(raw, "directGrade", "grade")), -100, 100
        )
        temperature = _plausible(
            _number(_first(raw, "directTemperature", "temperature")), -100, 100
        )

        samples.append(
            ActivityAnalysisSample(
                elapsed_seconds=elapsed,
                moving_seconds=moving,
                distance_meters=distance,
                pace_seconds_per_km=pace,
                heart_rate_bpm=heart_rate,
                cadence_spm=_cadence(raw),
                elevation_meters=elevation,
                grade_percent=grade,
                temperature_c=temperature,
            )
        )

    return _downsample(samples, _SAMPLE_LIMIT), len(samples)


def _split_rows(raw_splits: Any) -> list[Mapping[str, Any]]:
    if isinstance(raw_splits, list):
        return [item for item in raw_splits if isinstance(item, Mapping)]
    if not isinstance(raw_splits, Mapping):
        return []
    for key in ("lapDTOs", "laps", "splits", "activitySplits"):
        value = raw_splits.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, Mapping)]
    return []


def _analysis_splits(raw_splits: Any) -> list[ActivityAnalysisSplit]:
    result: list[ActivityAnalysisSplit] = []
    for fallback_index, raw in enumerate(_split_rows(raw_splits), start=1):
        speed = _number(_first(raw, "averageSpeed", "averageSpeedMps"))
        duration = _seconds(_first(raw, "duration", "durationSeconds"))
        distance = _number(_first(raw, "distance", "distanceMeters"))
        pace = _pace_from_speed(speed)
        if pace is None and duration and distance and distance > 0:
            pace = duration / (distance / 1_000)

        result.append(
            ActivityAnalysisSplit(
                split_index=_integer(_first(raw, "lapIndex", "splitIndex", "messageIndex"))
                or fallback_index,
                split_type=_text(
                    _first(raw, "lapType", "intensityType", "eventType", "type")
                ),
                duration_seconds=duration,
                moving_duration_seconds=_seconds(
                    _first(raw, "movingDuration", "movingDurationSeconds")
                ),
                distance_meters=distance,
                average_pace_seconds_per_km=_plausible(pace, 90, 3_600),
                average_heart_rate_bpm=_plausible(
                    _number(_first(raw, "averageHR", "averageHeartRate")), 20, 260
                ),
                max_heart_rate_bpm=_plausible(
                    _number(_first(raw, "maxHR", "maxHeartRate")), 20, 260
                ),
                average_cadence_spm=_summary_cadence(
                    _first(
                        raw,
                        "averageRunCadence",
                        "averageRunningCadence",
                        "averageCadence",
                    )
                ),
                elevation_gain_meters=_number(
                    _first(raw, "elevationGain", "elevationGainMeters")
                ),
                elevation_loss_meters=_number(
                    _first(raw, "elevationLoss", "elevationLossMeters")
                ),
                calories=_number(raw.get("calories")),
            )
        )
    return result[:500]


def normalize_activity_analysis(
    activity_id: str,
    details: Mapping[str, Any],
    raw_splits: Any,
    raw_summary: Mapping[str, Any] | None = None,
) -> ActivityRouteResponse:
    summary = _analysis_summary(raw_summary)
    points = _route_points(details)
    samples, source_sample_count = _analysis_samples(details)
    splits = _analysis_splits(raw_splits)

    bounds = None
    if points:
        lats = [point.lat for point in points]
        lons = [point.lon for point in points]
        bounds = ActivityRouteBounds(
            min_lat=min(lats),
            max_lat=max(lats),
            min_lon=min(lons),
            max_lon=max(lons),
        )

    channels = [
        name
        for name, present in (
            ("summary", any(value is not None for value in summary.model_dump().values())),
            ("pace", any(item.pace_seconds_per_km is not None for item in samples)),
            ("heart_rate", any(item.heart_rate_bpm is not None for item in samples)),
            ("cadence", any(item.cadence_spm is not None for item in samples)),
            ("elevation", any(item.elevation_meters is not None for item in samples)),
            ("grade", any(item.grade_percent is not None for item in samples)),
            ("temperature", any(item.temperature_c is not None for item in samples)),
            ("route", bool(points)),
            ("splits", bool(splits)),
        )
        if present
    ]

    return ActivityRouteResponse(
        activity_id=activity_id,
        summary=summary,
        points=points,
        bounds=bounds,
        samples=samples,
        splits=splits,
        available_channels=channels,
        source_sample_count=source_sample_count,
    )
