import pytest

from app.models import RunningWorkoutRequest
from app.workouts import to_garmin_running_workout


def _interval_request() -> RunningWorkoutRequest:
    return RunningWorkoutRequest.model_validate(
        {
            "name": "6 x 800 m",
            "description": "Threshold development",
            "steps": [
                {
                    "kind": "step",
                    "phase": "warmup",
                    "duration": {"type": "time", "seconds": 900},
                    "target": {"type": "open"},
                },
                {
                    "kind": "repeat",
                    "repetitions": 6,
                    "steps": [
                        {
                            "kind": "step",
                            "phase": "work",
                            "duration": {"type": "distance", "meters": 800},
                            "target": {
                                "type": "pace",
                                "fastestSecondsPerKm": 238,
                                "slowestSecondsPerKm": 243,
                            },
                        },
                        {
                            "kind": "step",
                            "phase": "recovery",
                            "duration": {"type": "time", "seconds": 120},
                            "target": {"type": "open"},
                        },
                    ],
                },
                {
                    "kind": "step",
                    "phase": "cooldown",
                    "duration": {"type": "time", "seconds": 600},
                    "target": {"type": "open"},
                },
            ],
        }
    )


def test_converts_structured_intervals_to_typed_running_workout() -> None:
    workout = to_garmin_running_workout(_interval_request())
    payload = workout.to_dict()

    assert payload["sportType"]["sportTypeKey"] == "running"
    assert payload["estimatedDurationInSecs"] == 3_374
    steps = payload["workoutSegments"][0]["workoutSteps"]
    assert [step["stepOrder"] for step in steps] == [1, 2, 5]

    repeat = steps[1]
    assert repeat["type"] == "RepeatGroupDTO"
    assert repeat["numberOfIterations"] == 6
    assert [step["stepOrder"] for step in repeat["workoutSteps"]] == [3, 4]

    interval = repeat["workoutSteps"][0]
    assert interval["endCondition"]["conditionTypeKey"] == "distance"
    assert interval["endConditionValue"] == 800
    assert interval["targetType"]["workoutTargetTypeKey"] == "pace.zone"
    assert interval["targetValueOne"] == pytest.approx(1_000 / 243)
    assert interval["targetValueTwo"] == pytest.approx(1_000 / 238)


def test_supports_lap_button_and_heart_rate_targets_with_explicit_estimate() -> None:
    request = RunningWorkoutRequest.model_validate(
        {
            "name": "Open tempo",
            "estimatedDurationSeconds": 1_800,
            "steps": [
                {
                    "kind": "step",
                    "phase": "work",
                    "duration": {"type": "open"},
                    "target": {
                        "type": "heart_rate",
                        "minimumBpm": 150,
                        "maximumBpm": 165,
                    },
                }
            ],
        }
    )
    step = to_garmin_running_workout(request).to_dict()["workoutSegments"][0][
        "workoutSteps"
    ][0]

    assert step["endCondition"]["conditionTypeKey"] == "lap.button"
    assert "endConditionValue" not in step
    assert step["targetType"]["workoutTargetTypeKey"] == "heart.rate.zone"
    assert step["targetValueOne"] == 150
    assert step["targetValueTwo"] == 165


def test_requires_estimate_when_duration_cannot_be_derived() -> None:
    request = RunningWorkoutRequest.model_validate(
        {
            "name": "Open run",
            "steps": [
                {
                    "kind": "step",
                    "phase": "work",
                    "duration": {"type": "open"},
                    "target": {"type": "open"},
                }
            ],
        }
    )

    with pytest.raises(ValueError, match="estimatedDurationSeconds"):
        to_garmin_running_workout(request)


def test_rejects_inverted_pace_and_heart_rate_ranges() -> None:
    with pytest.raises(ValueError, match="fastestSecondsPerKm"):
        RunningWorkoutRequest.model_validate(
            {
                "name": "Bad pace",
                "steps": [
                    {
                        "kind": "step",
                        "phase": "work",
                        "duration": {"type": "time", "seconds": 60},
                        "target": {
                            "type": "pace",
                            "fastestSecondsPerKm": 300,
                            "slowestSecondsPerKm": 240,
                        },
                    }
                ],
            }
        )
