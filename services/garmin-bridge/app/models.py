"""TrainVault-facing API models.

Garmin's undocumented response objects do not cross this boundary. Every
metric that may be absent for an account or device is nullable.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    """Shared JSON conventions for Next.js consumers."""

    model_config = ConfigDict(
        alias_generator=_to_camel,
        extra="forbid",
        populate_by_name=True,
    )


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"
    service: Literal["trainvault-garmin-bridge"] = "trainvault-garmin-bridge"
    version: str


class ProfileResponse(ApiModel):
    display_name: str | None = None
    full_name: str | None = None
    location: str | None = None
    country: str | None = None
    time_zone: str | None = None
    unit_system: str | None = None


class ActivityLap(ApiModel):
    lap_index: int | None = None
    duration_seconds: float | None = None
    distance_meters: float | None = None
    average_pace_seconds_per_km: float | None = None
    average_heart_rate_bpm: float | None = None


class ActivityResponse(ApiModel):
    activity_id: str | None = None
    activity_type: str | None = None
    title: str | None = None
    start_time: datetime | None = None
    local_start_time: datetime | None = None
    duration_seconds: float | None = None
    moving_duration_seconds: float | None = None
    distance_meters: float | None = None
    average_speed_mps: float | None = None
    average_pace_seconds_per_km: float | None = None
    average_heart_rate_bpm: float | None = None
    max_heart_rate_bpm: float | None = None
    average_cadence_spm: float | None = None
    elevation_gain_meters: float | None = None
    elevation_loss_meters: float | None = None
    calories: float | None = None
    aerobic_training_effect: float | None = None
    anaerobic_training_effect: float | None = None
    garmin_workout_id: str | None = None
    laps: list[ActivityLap] | None = None


class ActivitiesResponse(ApiModel):
    activities: list[ActivityResponse]
    start: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    returned: int = Field(ge=0)


class LatestActivityResponse(ApiModel):
    activity: ActivityResponse | None


class DailyRecoveryResponse(ApiModel):
    date: date
    resting_heart_rate_bpm: float | None = None
    hrv_last_night_ms: float | None = None
    hrv_weekly_average_ms: float | None = None
    hrv_status: str | None = None
    sleep_score: float | None = None
    sleep_duration_seconds: float | None = None
    deep_sleep_seconds: float | None = None
    rem_sleep_seconds: float | None = None
    average_stress_level: float | None = None
    body_battery_current: float | None = None
    body_battery_high: float | None = None
    body_battery_low: float | None = None
    training_readiness_score: float | None = None
    training_readiness_level: str | None = None
    training_readiness_feedback: str | None = None
    partial: bool = False
    unavailable_metrics: list[str] = Field(default_factory=list)


class TrainingStatusResponse(ApiModel):
    date: date
    status: str | None = None
    feedback: str | None = None
    load_level: str | None = None
    load_ratio: float | None = None
    acute_load: float | None = None
    chronic_load: float | None = None
    vo2_max: float | None = None


class DeviceResponse(ApiModel):
    device_id: str | None = None
    user_device_id: str | None = None
    display_name: str | None = None
    model: str | None = None
    serial_number: str | None = None
    primary: bool | None = None
    last_sync_time: datetime | None = None


class DevicesResponse(ApiModel):
    devices: list[DeviceResponse]


class TimeDuration(ApiModel):
    type: Literal["time"]
    seconds: float = Field(gt=0, le=86_400)


class DistanceDuration(ApiModel):
    type: Literal["distance"]
    meters: float = Field(gt=0, le=1_000_000)


class OpenDuration(ApiModel):
    type: Literal["open"]


WorkoutDuration = Annotated[
    TimeDuration | DistanceDuration | OpenDuration,
    Field(discriminator="type"),
]


class OpenTarget(ApiModel):
    type: Literal["open"]


class PaceTarget(ApiModel):
    type: Literal["pace"]
    fastest_seconds_per_km: float = Field(gt=0, le=3_600)
    slowest_seconds_per_km: float = Field(gt=0, le=3_600)

    @model_validator(mode="after")
    def validate_range(self) -> "PaceTarget":
        if self.fastest_seconds_per_km > self.slowest_seconds_per_km:
            raise ValueError(
                "fastestSecondsPerKm must be less than or equal to "
                "slowestSecondsPerKm"
            )
        return self


class HeartRateTarget(ApiModel):
    type: Literal["heart_rate"]
    minimum_bpm: int = Field(ge=30, le=250)
    maximum_bpm: int = Field(ge=30, le=250)

    @model_validator(mode="after")
    def validate_range(self) -> "HeartRateTarget":
        if self.minimum_bpm > self.maximum_bpm:
            raise ValueError("minimumBpm must be less than or equal to maximumBpm")
        return self


WorkoutTarget = Annotated[
    OpenTarget | PaceTarget | HeartRateTarget,
    Field(discriminator="type"),
]


class RunningWorkoutStep(ApiModel):
    kind: Literal["step"] = "step"
    phase: Literal["warmup", "work", "recovery", "cooldown"]
    duration: WorkoutDuration
    target: WorkoutTarget = Field(default_factory=lambda: OpenTarget(type="open"))
    description: str | None = Field(default=None, max_length=512)


class RunningWorkoutRepeat(ApiModel):
    kind: Literal["repeat"] = "repeat"
    repetitions: int = Field(ge=2, le=99)
    steps: list[RunningWorkoutStep] = Field(min_length=1, max_length=20)


RunningWorkoutElement = Annotated[
    RunningWorkoutStep | RunningWorkoutRepeat,
    Field(discriminator="kind"),
]


class RunningWorkoutRequest(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=1_024)
    estimated_duration_seconds: int | None = Field(
        default=None,
        gt=0,
        le=604_800,
    )
    steps: list[RunningWorkoutElement] = Field(min_length=1, max_length=100)


class WorkoutUploadResponse(ApiModel):
    workout_id: str
    name: str
    status: Literal["uploaded"] = "uploaded"


class ScheduleWorkoutRequest(ApiModel):
    date: date


class WorkoutScheduleResponse(ApiModel):
    workout_id: str
    workout_schedule_id: str
    date: date
    status: Literal["scheduled"] = "scheduled"


class PushWorkoutRequest(ApiModel):
    device_id: str | None = Field(
        default=None,
        description=(
            "Garmin userDeviceId. If omitted, Garmin's last-used device is selected."
        ),
    )


class WorkoutPushResponse(ApiModel):
    workout_id: str
    device_id: str
    accepted: Literal[True] = True
