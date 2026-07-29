"""Pure conversion from Garmin response dictionaries to stable API models."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from datetime import UTC, date, datetime
from typing import Any

from .models import (
    ActivityLap,
    ActivityResponse,
    DailyRecoveryResponse,
    DeviceResponse,
    ProfileResponse,
    TrainingStatusResponse,
)


def _get_path(value: Any, path: Sequence[str]) -> Any:
    current = value
    for part in path:
        if not isinstance(current, Mapping):
            return None
        current = current.get(part)
    return current


def _first_path(value: Any, *paths: Sequence[str]) -> Any:
    for path in paths:
        candidate = _get_path(value, path)
        if candidate is not None:
            return candidate
    return None


def _find_key(value: Any, *keys: str) -> Any:
    """Find the first exact Garmin key in a nested response."""
    if isinstance(value, Mapping):
        for key in keys:
            if key in value and value[key] is not None:
                return value[key]
        for nested in value.values():
            candidate = _find_key(nested, *keys)
            if candidate is not None:
                return candidate
    elif isinstance(value, list):
        for nested in value:
            candidate = _find_key(nested, *keys)
            if candidate is not None:
                return candidate
    return None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    if isinstance(value, Mapping):
        return _number(_first_path(value, ("value",), ("score",)))
    return None


def _text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, int):
        return str(value)
    return None


def _identifier(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return _text(value)


def _timestamp(value: Any, *, assume_utc: bool = False) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace(" ", "T")
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if assume_utc and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _pace_from_speed(speed_mps: float | None) -> float | None:
    if speed_mps is None or speed_mps <= 0:
        return None
    return 1_000.0 / speed_mps


def _normalize_lap(raw: Mapping[str, Any], index: int) -> ActivityLap:
    speed = _number(
        _first_path(raw, ("averageSpeed",), ("averageSpeedMps",))
    )
    return ActivityLap(
        lap_index=int(_number(raw.get("lapIndex")) or index),
        duration_seconds=_number(
            _first_path(raw, ("duration",), ("durationSeconds",))
        ),
        distance_meters=_number(
            _first_path(raw, ("distance",), ("distanceMeters",))
        ),
        average_pace_seconds_per_km=_pace_from_speed(speed),
        average_heart_rate_bpm=_number(
            _first_path(raw, ("averageHR",), ("averageHeartRate",))
        ),
    )


def normalize_activity(raw: Mapping[str, Any]) -> ActivityResponse:
    """Normalize one Garmin activity-list or detail object."""
    speed = _number(
        _first_path(raw, ("averageSpeed",), ("averageSpeedMps",))
    )
    raw_laps = _first_path(raw, ("laps",), ("activityLaps",))
    laps = (
        [
            _normalize_lap(lap, index)
            for index, lap in enumerate(raw_laps, start=1)
            if isinstance(lap, Mapping)
        ]
        if isinstance(raw_laps, list)
        else None
    )

    return ActivityResponse(
        activity_id=_identifier(
            _first_path(raw, ("activityId",), ("activityUUID",), ("id",))
        ),
        activity_type=_text(
            _first_path(
                raw,
                ("activityType", "typeKey"),
                ("activityTypeDTO", "typeKey"),
                ("activityType",),
                ("typeKey",),
            )
        ),
        title=_text(
            _first_path(raw, ("activityName",), ("title",), ("name",))
        ),
        start_time=_timestamp(
            _first_path(
                raw,
                ("startTimeGMT",),
                ("startTimeUTC",),
                ("startTime",),
            ),
            assume_utc=True,
        ),
        local_start_time=_timestamp(
            _first_path(raw, ("startTimeLocal",), ("localStartTime",))
        ),
        duration_seconds=_number(
            _first_path(raw, ("duration",), ("durationSeconds",))
        ),
        moving_duration_seconds=_number(
            _first_path(raw, ("movingDuration",), ("movingDurationSeconds",))
        ),
        distance_meters=_number(
            _first_path(raw, ("distance",), ("distanceMeters",))
        ),
        average_speed_mps=speed,
        average_pace_seconds_per_km=_pace_from_speed(speed),
        average_heart_rate_bpm=_number(
            _first_path(
                raw,
                ("averageHR",),
                ("averageHeartRate",),
                ("averageHeartRateBpm",),
            )
        ),
        max_heart_rate_bpm=_number(
            _first_path(raw, ("maxHR",), ("maxHeartRate",), ("maxHeartRateBpm",))
        ),
        average_cadence_spm=_number(
            _first_path(
                raw,
                ("averageRunningCadenceInStepsPerMinute",),
                ("averageRunningCadence",),
                ("averageCadence",),
            )
        ),
        elevation_gain_meters=_number(
            _first_path(raw, ("elevationGain",), ("elevationGainMeters",))
        ),
        elevation_loss_meters=_number(
            _first_path(raw, ("elevationLoss",), ("elevationLossMeters",))
        ),
        calories=_number(raw.get("calories")),
        aerobic_training_effect=_number(
            _first_path(raw, ("aerobicTrainingEffect",), ("trainingEffect",))
        ),
        anaerobic_training_effect=_number(raw.get("anaerobicTrainingEffect")),
        garmin_workout_id=_identifier(
            _first_path(raw, ("workoutId",), ("parentWorkoutId",))
        ),
        laps=laps,
    )


def normalize_profile(raw: Mapping[str, Any]) -> ProfileResponse:
    """Normalize profile fields without exposing email or account identifiers."""
    return ProfileResponse(
        display_name=_text(
            _first_path(
                raw,
                ("displayName",),
                ("userData", "displayName"),
                ("profile", "displayName"),
            )
        ),
        full_name=_text(
            _first_path(
                raw,
                ("fullName",),
                ("userData", "fullName"),
                ("profile", "fullName"),
            )
        ),
        location=_text(
            _first_path(
                raw,
                ("location",),
                ("userData", "location"),
                ("profile", "location"),
            )
        ),
        country=_text(
            _first_path(
                raw,
                ("countryCode",),
                ("country",),
                ("userData", "countryCode"),
            )
        ),
        time_zone=_text(
            _first_path(
                raw,
                ("timeZone",),
                ("timeZoneId",),
                ("userData", "timeZone"),
            )
        ),
        unit_system=_text(
            _first_path(
                raw,
                ("measurementSystem",),
                ("unitSystem",),
                ("userData", "measurementSystem"),
            )
        ),
    )


def _body_battery_values(raw: Any) -> list[float]:
    points = _find_key(raw, "bodyBatteryValuesArray", "bodyBatteryValues")
    if not isinstance(points, list):
        return []
    values: list[float] = []
    for point in points:
        if isinstance(point, list) and len(point) >= 3:
            value = _number(point[2])
        elif isinstance(point, Mapping):
            value = _number(_first_path(point, ("value",), ("bodyBattery",)))
        else:
            value = None
        if value is not None and value >= 0:
            values.append(value)
    return values


def _readiness_snapshot(raw: Any) -> Mapping[str, Any]:
    if isinstance(raw, Mapping):
        return raw
    if not isinstance(raw, list):
        return {}
    candidates = [item for item in raw if isinstance(item, Mapping)]
    if not candidates:
        return {}
    for candidate in candidates:
        if candidate.get("inputContext") == "AFTER_WAKEUP_RESET":
            return candidate
    return candidates[0]


def normalize_recovery(
    snapshot_date: date,
    *,
    stats: Any = None,
    hrv: Any = None,
    sleep: Any = None,
    body_battery: Any = None,
    readiness: Any = None,
    unavailable_metrics: Iterable[str] = (),
) -> DailyRecoveryResponse:
    """Combine independent Garmin health endpoints into one nullable snapshot."""
    hrv_summary = _find_key(hrv, "hrvSummary") or hrv
    daily_sleep = _find_key(sleep, "dailySleepDTO") or sleep
    sleep_scores = _find_key(daily_sleep, "sleepScores") or daily_sleep
    readiness_value = _readiness_snapshot(readiness)
    battery_values = _body_battery_values(body_battery)
    unavailable = sorted(set(unavailable_metrics))

    battery_high = _number(
        _find_key(
            body_battery,
            "bodyBatteryHighestValue",
            "highestValue",
            "high",
        )
    )
    battery_low = _number(
        _find_key(
            body_battery,
            "bodyBatteryLowestValue",
            "lowestValue",
            "low",
        )
    )

    return DailyRecoveryResponse(
        date=snapshot_date,
        resting_heart_rate_bpm=_number(
            _find_key(stats, "restingHeartRate", "restingHeartRateBpm")
        ),
        hrv_last_night_ms=_number(
            _find_key(hrv_summary, "lastNightAvg", "lastNightAverage")
        ),
        hrv_weekly_average_ms=_number(
            _find_key(hrv_summary, "weeklyAvg", "weeklyAverage")
        ),
        hrv_status=_text(_find_key(hrv_summary, "status", "hrvStatus")),
        sleep_score=_number(
            _find_key(sleep_scores, "overallScore", "sleepScore", "overall")
        ),
        sleep_duration_seconds=_number(
            _find_key(daily_sleep, "sleepTimeSeconds", "durationInSeconds")
        ),
        deep_sleep_seconds=_number(_find_key(daily_sleep, "deepSleepSeconds")),
        rem_sleep_seconds=_number(_find_key(daily_sleep, "remSleepSeconds")),
        average_stress_level=_number(
            _find_key(stats, "averageStressLevel", "avgStressLevel")
        ),
        body_battery_current=battery_values[-1] if battery_values else None,
        body_battery_high=battery_high
        if battery_high is not None
        else (max(battery_values) if battery_values else None),
        body_battery_low=battery_low
        if battery_low is not None
        else (min(battery_values) if battery_values else None),
        training_readiness_score=_number(
            _find_key(readiness_value, "score", "trainingReadinessScore")
        ),
        training_readiness_level=_text(
            _find_key(readiness_value, "level", "scoreFeedback")
        ),
        training_readiness_feedback=_text(
            _find_key(
                readiness_value,
                "feedbackLong",
                "feedbackShort",
                "feedback",
            )
        ),
        partial=bool(unavailable),
        unavailable_metrics=unavailable,
    )


def normalize_training_status(
    snapshot_date: date,
    raw: Mapping[str, Any],
) -> TrainingStatusResponse:
    """Normalize unstable nested training-status response shapes."""
    return TrainingStatusResponse(
        date=snapshot_date,
        status=_text(
            _find_key(
                raw,
                "trainingStatus",
                "trainingStatusKey",
                "trainingStatusPhrase",
            )
        ),
        feedback=_text(
            _find_key(
                raw,
                "trainingStatusFeedbackPhrase",
                "feedbackPhrase",
                "feedback",
            )
        ),
        load_level=_text(
            _find_key(raw, "loadLevelTrend", "loadLevel", "trainingLoadLevel")
        ),
        load_ratio=_number(
            _find_key(raw, "loadRatio", "acuteChronicWorkloadRatio")
        ),
        acute_load=_number(
            _find_key(raw, "acuteLoad", "acuteTrainingLoad", "weeklyTrainingLoad")
        ),
        chronic_load=_number(
            _find_key(raw, "chronicLoad", "chronicTrainingLoad")
        ),
        vo2_max=_number(
            _find_key(raw, "vo2MaxPreciseValue", "vo2MaxValue", "vo2Max")
        ),
    )


def normalize_device(raw: Mapping[str, Any]) -> DeviceResponse:
    """Normalize a Garmin registered-device object."""
    return DeviceResponse(
        device_id=_identifier(
            _first_path(raw, ("deviceId",), ("unitId",), ("id",))
        ),
        user_device_id=_identifier(
            _first_path(raw, ("userDeviceId",), ("deviceRegistrationId",))
        ),
        display_name=_text(
            _first_path(
                raw,
                ("displayName",),
                ("deviceName",),
                ("productDisplayName",),
            )
        ),
        model=_text(
            _first_path(raw, ("productType",), ("deviceTypeName",), ("model",))
        ),
        serial_number=_text(
            _first_path(raw, ("serialNumber",), ("unitId",))
        ),
        primary=(
            bool(_first_path(raw, ("primary",), ("isPrimary",)))
            if _first_path(raw, ("primary",), ("isPrimary",)) is not None
            else None
        ),
        last_sync_time=_timestamp(
            _first_path(
                raw,
                ("lastSyncTime",),
                ("lastSyncDate",),
                ("lastSyncTimeGMT",),
            ),
            assume_utc=True,
        ),
    )
