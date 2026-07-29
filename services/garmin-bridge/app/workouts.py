"""Convert TrainVault's structured running request into Garmin typed models."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from garminconnect.workout import (
    ExecutableStep,
    RepeatGroup,
    RunningWorkout,
    WorkoutSegment,
)

from .models import (
    DistanceDuration,
    HeartRateTarget,
    OpenDuration,
    PaceTarget,
    RunningWorkoutElement,
    RunningWorkoutRepeat,
    RunningWorkoutRequest,
    RunningWorkoutStep,
    TimeDuration,
)

RUNNING_SPORT_TYPE = {
    "sportTypeId": 1,
    "sportTypeKey": "running",
    "displayOrder": 1,
}

STEP_TYPES: dict[str, dict[str, Any]] = {
    "warmup": {
        "stepTypeId": 1,
        "stepTypeKey": "warmup",
        "displayOrder": 1,
    },
    "cooldown": {
        "stepTypeId": 2,
        "stepTypeKey": "cooldown",
        "displayOrder": 2,
    },
    "work": {
        "stepTypeId": 3,
        "stepTypeKey": "interval",
        "displayOrder": 3,
    },
    "recovery": {
        "stepTypeId": 4,
        "stepTypeKey": "recovery",
        "displayOrder": 4,
    },
}

END_CONDITIONS: dict[str, dict[str, Any]] = {
    "open": {
        "conditionTypeId": 1,
        "conditionTypeKey": "lap.button",
        "displayOrder": 1,
        "displayable": True,
    },
    "time": {
        "conditionTypeId": 2,
        "conditionTypeKey": "time",
        "displayOrder": 2,
        "displayable": True,
    },
    "distance": {
        "conditionTypeId": 3,
        "conditionTypeKey": "distance",
        "displayOrder": 3,
        "displayable": True,
    },
}

NO_TARGET = {
    "workoutTargetTypeId": 1,
    "workoutTargetTypeKey": "no.target",
    "displayOrder": 1,
}

PACE_TARGET = {
    "workoutTargetTypeId": 6,
    "workoutTargetTypeKey": "pace.zone",
    "displayOrder": 6,
}

HEART_RATE_TARGET = {
    "workoutTargetTypeId": 4,
    "workoutTargetTypeKey": "heart.rate.zone",
    "displayOrder": 4,
}


@dataclass(slots=True)
class _StepOrder:
    value: int = 0

    def next(self) -> int:
        self.value += 1
        return self.value


def _duration(step: RunningWorkoutStep) -> tuple[dict[str, Any], float | None]:
    duration = step.duration
    if isinstance(duration, TimeDuration):
        return END_CONDITIONS["time"], duration.seconds
    if isinstance(duration, DistanceDuration):
        return END_CONDITIONS["distance"], duration.meters
    if isinstance(duration, OpenDuration):
        return END_CONDITIONS["open"], None
    raise TypeError(f"Unsupported duration: {type(duration).__name__}")


def _target(step: RunningWorkoutStep) -> tuple[dict[str, Any], dict[str, float]]:
    target = step.target
    if isinstance(target, PaceTarget):
        # Garmin stores pace target bounds as speed in metres per second.
        # Value one is the slower/lower speed and value two the faster speed.
        return PACE_TARGET, {
            "targetValueOne": 1_000.0 / target.slowest_seconds_per_km,
            "targetValueTwo": 1_000.0 / target.fastest_seconds_per_km,
        }
    if isinstance(target, HeartRateTarget):
        return HEART_RATE_TARGET, {
            "targetValueOne": float(target.minimum_bpm),
            "targetValueTwo": float(target.maximum_bpm),
        }
    return NO_TARGET, {}


def _convert_step(
    step: RunningWorkoutStep,
    order: _StepOrder,
) -> ExecutableStep:
    end_condition, end_value = _duration(step)
    target_type, target_values = _target(step)
    extras: dict[str, Any] = target_values
    if step.description:
        extras["description"] = step.description

    return ExecutableStep(
        stepOrder=order.next(),
        stepType=STEP_TYPES[step.phase],
        endCondition=end_condition,
        endConditionValue=end_value,
        targetType=target_type,
        **extras,
    )


def _convert_repeat(
    repeat: RunningWorkoutRepeat,
    order: _StepOrder,
) -> RepeatGroup:
    repeat_order = order.next()
    children = [_convert_step(step, order) for step in repeat.steps]
    return RepeatGroup(
        stepOrder=repeat_order,
        stepType={
            "stepTypeId": 6,
            "stepTypeKey": "repeat",
            "displayOrder": 6,
        },
        numberOfIterations=repeat.repetitions,
        workoutSteps=children,
        endCondition={
            "conditionTypeId": 7,
            "conditionTypeKey": "iterations",
            "displayOrder": 7,
            "displayable": False,
        },
        endConditionValue=float(repeat.repetitions),
    )


def _estimated_step_duration(step: RunningWorkoutStep) -> float | None:
    if isinstance(step.duration, TimeDuration):
        return step.duration.seconds
    if isinstance(step.duration, DistanceDuration) and isinstance(
        step.target, PaceTarget
    ):
        average_pace = (
            step.target.fastest_seconds_per_km
            + step.target.slowest_seconds_per_km
        ) / 2
        return step.duration.meters * average_pace / 1_000
    return None


def _estimated_duration(elements: list[RunningWorkoutElement]) -> int:
    total = 0.0
    for element in elements:
        if isinstance(element, RunningWorkoutStep):
            duration = _estimated_step_duration(element)
            if duration is None:
                raise ValueError(
                    "estimatedDurationSeconds is required when an open step or "
                    "an untargeted distance step is present"
                )
            total += duration
        else:
            repeated = [_estimated_step_duration(step) for step in element.steps]
            if any(value is None for value in repeated):
                raise ValueError(
                    "estimatedDurationSeconds is required when a repeat contains "
                    "an open step or an untargeted distance step"
                )
            total += sum(value for value in repeated if value is not None) * (
                element.repetitions
            )
    return max(1, round(total))


def to_garmin_running_workout(request: RunningWorkoutRequest) -> RunningWorkout:
    """Build the exact typed object accepted by ``upload_running_workout``."""
    order = _StepOrder()
    converted: list[ExecutableStep | RepeatGroup] = []
    for element in request.steps:
        if isinstance(element, RunningWorkoutRepeat):
            converted.append(_convert_repeat(element, order))
        else:
            converted.append(_convert_step(element, order))

    estimated_duration = (
        request.estimated_duration_seconds
        if request.estimated_duration_seconds is not None
        else _estimated_duration(request.steps)
    )

    return RunningWorkout(
        workoutName=request.name,
        description=request.description,
        estimatedDurationInSecs=estimated_duration,
        workoutSegments=[
            WorkoutSegment(
                segmentOrder=1,
                sportType=RUNNING_SPORT_TYPE,
                workoutSteps=converted,
            )
        ],
    )
