from datetime import date

import pytest

from app.errors import GarminInvalidResponse
from app.gateway import GarminGateway
from app.models import RunningWorkoutRequest


class _Provider:
    def __init__(self, client) -> None:
        self.client = client
        self.invalidated = False

    def get_client(self):
        return self.client

    def invalidate(self) -> None:
        self.invalidated = True


class _Client:
    def __init__(self) -> None:
        self.upload_result = {"workoutId": 777, "workoutName": "Sunday easy"}
        self.pushed: tuple[str, str] | None = None

    def upload_running_workout(self, workout):
        assert workout.workoutName == "Sunday easy"
        return self.upload_result

    def schedule_workout(self, workout_id: str, schedule_date: str):
        return {
            "workoutScheduleId": 888,
            "workout": {"workoutId": int(workout_id)},
            "calendarDate": schedule_date,
        }

    def get_device_last_used(self):
        return {"userDeviceId": 456}

    def push_workout_to_device(self, *, workout_id: str, device_id: str):
        self.pushed = (workout_id, device_id)
        return [{"messageId": 1}]


def _request() -> RunningWorkoutRequest:
    return RunningWorkoutRequest.model_validate(
        {
            "name": "Sunday easy",
            "steps": [
                {
                    "kind": "step",
                    "phase": "work",
                    "duration": {"type": "time", "seconds": 1800},
                    "target": {"type": "open"},
                }
            ],
        }
    )


def test_gateway_only_reports_confirmed_mutation_identifiers() -> None:
    client = _Client()
    gateway = GarminGateway(_Provider(client))  # type: ignore[arg-type]

    uploaded = gateway.upload_workout(_request())
    scheduled = gateway.schedule_workout("777", date(2026, 8, 2))
    pushed = gateway.push_workout("777", device_id=None)

    assert uploaded.workout_id == "777"
    assert scheduled.workout_schedule_id == "888"
    assert pushed.device_id == "456"
    assert client.pushed == ("777", "456")


def test_gateway_never_fakes_upload_success_without_workout_id() -> None:
    client = _Client()
    client.upload_result = {"workoutName": "Sunday easy"}
    gateway = GarminGateway(_Provider(client))  # type: ignore[arg-type]

    with pytest.raises(GarminInvalidResponse):
        gateway.upload_workout(_request())
