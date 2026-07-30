"""TrainVault-specific Garmin adapter; no raw Garmin objects leave this module."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import date
from math import isfinite
from typing import Any, TypeVar

from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)

from .auth import GarminClientProvider
from .errors import (
    GarminAuthenticationRequired,
    GarminInvalidRequest,
    GarminInvalidResponse,
    GarminRateLimited,
    GarminUpstreamUnavailable,
)
from .models import (
    ActivitiesResponse,
    ActivityResponse,
    DailyRecoveryResponse,
    DevicesResponse,
    LatestActivityResponse,
    ProfileResponse,
    RunningWorkoutRequest,
    TrainingStatusResponse,
    WorkoutPushResponse,
    WorkoutScheduleResponse,
    WorkoutUploadResponse,
)
from .normalizers import (
    normalize_activity,
    normalize_device,
    normalize_profile,
    normalize_recovery,
    normalize_training_status,
)
from .route_models import ActivityRouteBounds, ActivityRoutePoint, ActivityRouteResponse
from .workouts import to_garmin_running_workout

T = TypeVar("T")


class GarminGateway:
    """Synchronous gateway used by FastAPI's worker thread pool."""

    def __init__(self, provider: GarminClientProvider) -> None:
        self._provider = provider

    def _call(self, operation: Callable[[Garmin], T]) -> T:
        client = self._provider.get_client()
        try:
            return operation(client)
        except GarminConnectTooManyRequestsError as exc:
            raise GarminRateLimited() from exc
        except GarminConnectAuthenticationError as exc:
            self._provider.invalidate()
            raise GarminAuthenticationRequired() from exc
        except GarminConnectConnectionError as exc:
            raise GarminUpstreamUnavailable() from exc
        except ValueError as exc:
            raise GarminInvalidRequest() from exc
        except (GarminInvalidRequest, GarminInvalidResponse):
            raise
        except Exception as exc:
            # Garmin errors may contain URLs or account metadata; keep them private.
            raise GarminUpstreamUnavailable() from exc

    def profile(self) -> ProfileResponse:
        raw = self._call(lambda client: client.get_user_profile())
        if not isinstance(raw, Mapping):
            raise GarminInvalidResponse()
        return normalize_profile(raw)

    def activities(
        self,
        *,
        start: int,
        limit: int,
        activity_type: str | None,
    ) -> ActivitiesResponse:
        raw = self._call(
            lambda client: client.get_activities(
                start=start,
                limit=limit,
                activitytype=activity_type,
            )
        )
        if isinstance(raw, Mapping):
            raw = raw.get("activities", [])
        if not isinstance(raw, list):
            raise GarminInvalidResponse()
        activities = [
            normalize_activity(item) for item in raw if isinstance(item, Mapping)
        ]
        return ActivitiesResponse(
            activities=activities,
            start=start,
            limit=limit,
            returned=len(activities),
        )

    def latest_activity(self) -> LatestActivityResponse:
        activities = self.activities(start=0, limit=1, activity_type=None)
        return LatestActivityResponse(
            activity=activities.activities[0] if activities.activities else None
        )

    def activity_route(self, activity_id: str) -> ActivityRouteResponse:
        """Return only bounded GPS geometry required for TrainVault's private trace."""
        raw = self._call(
            lambda client: client.get_activity_details(
                activity_id,
                maxchart=1,
                maxpoly=1_200,
            )
        )
        if not isinstance(raw, Mapping):
            raise GarminInvalidResponse()

        geo = raw.get("geoPolylineDTO")
        if not isinstance(geo, Mapping):
            return ActivityRouteResponse(activity_id=activity_id)

        polyline = geo.get("polyline")
        if not isinstance(polyline, list):
            return ActivityRouteResponse(activity_id=activity_id)

        points: list[ActivityRoutePoint] = []
        for item in polyline[:1_500]:
            if not isinstance(item, Mapping):
                continue
            lat = _route_number(item.get("lat"))
            lon = _route_number(item.get("lon"))
            if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            points.append(
                ActivityRoutePoint(
                    lat=lat,
                    lon=lon,
                    elevation_meters=_route_number(item.get("altitude")),
                    distance_meters=_route_number(item.get("distanceInMeters")),
                    time_ms=_route_int(item.get("time")),
                )
            )

        if not points:
            return ActivityRouteResponse(activity_id=activity_id)

        lats = [point.lat for point in points]
        lons = [point.lon for point in points]
        return ActivityRouteResponse(
            activity_id=activity_id,
            points=points,
            bounds=ActivityRouteBounds(
                min_lat=min(lats),
                max_lat=max(lats),
                min_lon=min(lons),
                max_lon=max(lons),
            ),
        )

    def recovery(self, snapshot_date: date) -> DailyRecoveryResponse:
        client = self._provider.get_client()
        raw: dict[str, Any] = {}
        unavailable: list[str] = []
        successful_calls = 0
        connection_failures = 0

        operations: dict[str, Callable[[], Any]] = {
            "daily_stats": lambda: client.get_stats(snapshot_date.isoformat()),
            "hrv": lambda: client.get_hrv_data(snapshot_date.isoformat()),
            "sleep": lambda: client.get_sleep_data(snapshot_date.isoformat()),
            "body_battery": lambda: client.get_body_battery(
                snapshot_date.isoformat()
            ),
            "training_readiness": lambda: client.get_training_readiness(
                snapshot_date.isoformat()
            ),
        }

        for name, operation in operations.items():
            try:
                raw[name] = operation()
                successful_calls += 1
            except GarminConnectNotFoundError:
                raw[name] = None
                unavailable.append(name)
                # A confirmed "no data" is still a successful upstream response.
                successful_calls += 1
            except GarminConnectTooManyRequestsError as exc:
                raise GarminRateLimited() from exc
            except GarminConnectAuthenticationError as exc:
                self._provider.invalidate()
                raise GarminAuthenticationRequired() from exc
            except GarminConnectConnectionError:
                raw[name] = None
                unavailable.append(name)
                connection_failures += 1
            except Exception as exc:
                raise GarminUpstreamUnavailable() from exc

        if successful_calls == 0 and connection_failures:
            raise GarminUpstreamUnavailable()

        return normalize_recovery(
            snapshot_date,
            stats=raw.get("daily_stats"),
            hrv=raw.get("hrv"),
            sleep=raw.get("sleep"),
            body_battery=raw.get("body_battery"),
            readiness=raw.get("training_readiness"),
            unavailable_metrics=unavailable,
        )

    def training_status(self, snapshot_date: date) -> TrainingStatusResponse:
        raw = self._call(
            lambda client: client.get_training_status(snapshot_date.isoformat())
        )
        if not isinstance(raw, Mapping):
            raise GarminInvalidResponse()
        return normalize_training_status(snapshot_date, raw)

    def devices(self) -> DevicesResponse:
        raw = self._call(lambda client: client.get_devices())
        if isinstance(raw, Mapping):
            raw = raw.get("devices", [])
        if not isinstance(raw, list):
            raise GarminInvalidResponse()
        return DevicesResponse(
            devices=[
                normalize_device(item) for item in raw if isinstance(item, Mapping)
            ]
        )

    def upload_workout(
        self,
        request: RunningWorkoutRequest,
    ) -> WorkoutUploadResponse:
        try:
            workout = to_garmin_running_workout(request)
        except (TypeError, ValueError) as exc:
            raise GarminInvalidRequest() from exc

        result = self._call(
            lambda client: client.upload_running_workout(workout)
        )
        if not isinstance(result, Mapping):
            raise GarminInvalidResponse()
        workout_id = _identifier(result.get("workoutId"))
        if workout_id is None:
            raise GarminInvalidResponse()
        returned_name = result.get("workoutName")
        return WorkoutUploadResponse(
            workout_id=workout_id,
            name=returned_name if isinstance(returned_name, str) else request.name,
        )

    def schedule_workout(
        self,
        workout_id: str,
        schedule_date: date,
    ) -> WorkoutScheduleResponse:
        result = self._call(
            lambda client: client.schedule_workout(
                workout_id,
                schedule_date.isoformat(),
            )
        )
        if not isinstance(result, Mapping):
            raise GarminInvalidResponse()

        schedule_id = _identifier(result.get("workoutScheduleId"))
        returned_workout_id = _identifier(
            result.get("workoutId")
            or (
                result.get("workout", {}).get("workoutId")
                if isinstance(result.get("workout"), Mapping)
                else None
            )
        )
        returned_date = result.get("calendarDate")
        if schedule_id is None:
            raise GarminInvalidResponse()
        if returned_workout_id is not None and returned_workout_id != workout_id:
            raise GarminInvalidResponse()
        if returned_date is not None and str(returned_date) != schedule_date.isoformat():
            raise GarminInvalidResponse()

        return WorkoutScheduleResponse(
            workout_id=workout_id,
            workout_schedule_id=schedule_id,
            date=schedule_date,
        )

    def push_workout(
        self,
        workout_id: str,
        *,
        device_id: str | None,
    ) -> WorkoutPushResponse:
        resolved_device_id = device_id
        if resolved_device_id is None:
            last_used = self._call(lambda client: client.get_device_last_used())
            if not isinstance(last_used, Mapping):
                raise GarminInvalidResponse()
            resolved_device_id = _identifier(last_used.get("userDeviceId"))
            if resolved_device_id is None:
                raise GarminInvalidResponse()

        result = self._call(
            lambda client: client.push_workout_to_device(
                workout_id=workout_id,
                device_id=resolved_device_id,
            )
        )
        if result is None:
            raise GarminInvalidResponse()

        return WorkoutPushResponse(
            workout_id=workout_id,
            device_id=resolved_device_id,
        )


def _route_number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if isfinite(parsed) else None


def _route_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _identifier(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None
