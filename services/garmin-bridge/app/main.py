"""FastAPI entry point exposing only TrainVault-specific Garmin operations."""

from __future__ import annotations

import secrets
from collections.abc import Mapping
from datetime import date
from typing import Annotated

from fastapi import Body, Depends, FastAPI, Path, Query, Request
from fastapi.responses import JSONResponse

from . import __version__
from .activity_analysis import normalize_activity_analysis
from .auth import GarminClientProvider, LocalTokenStore
from .config import Settings
from .errors import GarminBridgeError, GarminBridgeUnauthorized, GarminInvalidResponse
from .gateway import GarminGateway
from .models import (
    ActivitiesResponse,
    DailyRecoveryResponse,
    DevicesResponse,
    HealthResponse,
    LatestActivityResponse,
    ProfileResponse,
    PushWorkoutRequest,
    RunningWorkoutRequest,
    ScheduleWorkoutRequest,
    TrainingStatusResponse,
    WorkoutPushResponse,
    WorkoutScheduleResponse,
    WorkoutUploadResponse,
)
from .route_models import ActivityRouteResponse

WorkoutId = Annotated[
    str,
    Path(
        min_length=1,
        max_length=32,
        pattern=r"^[1-9][0-9]*$",
        description="Garmin workout identifier",
    ),
]
WorkoutScheduleId = Annotated[
    str,
    Path(
        min_length=1,
        max_length=32,
        pattern=r"^[1-9][0-9]*$",
        description="Garmin workout schedule identifier",
    ),
]
ActivityId = Annotated[
    str,
    Path(
        min_length=1,
        max_length=32,
        pattern=r"^[1-9][0-9]*$",
        description="Garmin activity identifier",
    ),
]


def _build_gateway(settings: Settings) -> GarminGateway:
    provider = GarminClientProvider(
        settings,
        LocalTokenStore(settings.token_store_path),
    )
    return GarminGateway(provider)


def get_gateway(request: Request) -> GarminGateway:
    """Resolve the app-scoped gateway; tests can override this dependency."""
    return request.app.state.garmin_gateway


def require_bridge_token(request: Request) -> None:
    """Protect account data when a server-to-server token is configured."""
    expected = request.app.state.api_token
    if expected is None:
        return

    authorization = request.headers.get("authorization", "")
    supplied = (
        authorization.removeprefix("Bearer ").strip()
        if authorization.startswith("Bearer ")
        else request.headers.get("x-trainvault-garmin-token", "").strip()
    )
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise GarminBridgeUnauthorized()


def create_app(
    gateway: GarminGateway | None = None,
    *,
    api_token: str | None = None,
    production: bool | None = None,
) -> FastAPI:
    """Create an isolated app instance for production or tests."""
    runtime_production = bool(production)

    if gateway is None:
        settings = Settings.from_env()
        runtime_production = settings.production if production is None else production
        if settings.host not in {"127.0.0.1", "::1", "localhost"} and not (
            settings.api_token
        ):
            raise RuntimeError(
                "GARMIN_BRIDGE_API_TOKEN is required when binding beyond localhost"
            )
        gateway = _build_gateway(settings)
        api_token = settings.api_token

    if runtime_production and not api_token:
        raise RuntimeError("GARMIN_BRIDGE_API_TOKEN is required in production")

    api = FastAPI(
        title="TrainVault Garmin Bridge",
        version=__version__,
        docs_url=None if runtime_production else "/docs",
        redoc_url=None,
        openapi_url=None if runtime_production else "/openapi.json",
    )

    api.state.garmin_gateway = gateway
    api.state.api_token = api_token
    api.state.production = runtime_production

    @api.middleware("http")
    async def hardened_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if runtime_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response

    @api.exception_handler(GarminBridgeError)
    async def handle_bridge_error(
        _request: Request,
        exc: GarminBridgeError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.public_message,
                }
            },
        )

    @api.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(version=__version__)

    @api.get(
        "/profile",
        response_model=ProfileResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def profile(
        garmin: GarminGateway = Depends(get_gateway),
    ) -> ProfileResponse:
        return garmin.profile()

    @api.get(
        "/activities",
        response_model=ActivitiesResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def activities(
        start: Annotated[int, Query(ge=0)] = 0,
        limit: Annotated[int, Query(ge=1, le=100)] = 20,
        activity_type: Annotated[
            str | None,
            Query(alias="activityType", min_length=1, max_length=64),
        ] = None,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> ActivitiesResponse:
        return garmin.activities(
            start=start,
            limit=limit,
            activity_type=activity_type,
        )

    @api.get(
        "/activities/latest",
        response_model=LatestActivityResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def latest_activity(
        garmin: GarminGateway = Depends(get_gateway),
    ) -> LatestActivityResponse:
        return garmin.latest_activity()

    @api.get(
        "/activities/{activity_id}/route",
        response_model=ActivityRouteResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def activity_route(
        activity_id: ActivityId,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> ActivityRouteResponse:
        """Return a bounded route, time series and split bank for one activity."""
        details = garmin._call(  # noqa: SLF001 - app-internal gateway boundary
            lambda client: client.get_activity_details(
                activity_id,
                maxchart=2_000,
                maxpoly=1_200,
            )
        )
        if not isinstance(details, Mapping):
            raise GarminInvalidResponse()
        splits = garmin._call(  # noqa: SLF001 - app-internal gateway boundary
            lambda client: client.get_activity_splits(activity_id)
        )
        return normalize_activity_analysis(activity_id, details, splits)

    @api.get(
        "/recovery/{snapshot_date}",
        response_model=DailyRecoveryResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def recovery(
        snapshot_date: date,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> DailyRecoveryResponse:
        return garmin.recovery(snapshot_date)

    @api.get(
        "/training-status",
        response_model=TrainingStatusResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def training_status(
        snapshot_date: Annotated[
            date | None,
            Query(alias="date"),
        ] = None,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> TrainingStatusResponse:
        return garmin.training_status(snapshot_date or date.today())

    @api.get(
        "/devices",
        response_model=DevicesResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def devices(
        garmin: GarminGateway = Depends(get_gateway),
    ) -> DevicesResponse:
        return garmin.devices()

    @api.post(
        "/workouts",
        response_model=WorkoutUploadResponse,
        status_code=201,
        dependencies=[Depends(require_bridge_token)],
    )
    def upload_workout(
        workout: RunningWorkoutRequest,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> WorkoutUploadResponse:
        return garmin.upload_workout(workout)

    @api.post(
        "/workouts/{workout_id}/schedule",
        response_model=WorkoutScheduleResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def schedule_workout(
        workout_id: WorkoutId,
        schedule: ScheduleWorkoutRequest,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> WorkoutScheduleResponse:
        return garmin.schedule_workout(workout_id, schedule.date)

    @api.delete(
        "/workout-schedules/{workout_schedule_id}",
        dependencies=[Depends(require_bridge_token)],
    )
    def unschedule_workout(
        workout_schedule_id: WorkoutScheduleId,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> dict[str, str]:
        garmin.unschedule_workout(workout_schedule_id)
        return {
            "status": "unscheduled",
            "workoutScheduleId": workout_schedule_id,
        }

    @api.delete(
        "/workouts/{workout_id}",
        dependencies=[Depends(require_bridge_token)],
    )
    def delete_workout(
        workout_id: WorkoutId,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> dict[str, str]:
        garmin.delete_workout(workout_id)
        return {"status": "deleted", "workoutId": workout_id}

    @api.post(
        "/workouts/{workout_id}/push",
        response_model=WorkoutPushResponse,
        dependencies=[Depends(require_bridge_token)],
    )
    def push_workout(
        workout_id: WorkoutId,
        push: Annotated[PushWorkoutRequest | None, Body()] = None,
        garmin: GarminGateway = Depends(get_gateway),
    ) -> WorkoutPushResponse:
        return garmin.push_workout(
            workout_id,
            device_id=push.device_id if push else None,
        )

    return api


app = create_app()
