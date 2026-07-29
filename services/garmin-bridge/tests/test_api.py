from datetime import UTC, date, datetime

from fastapi.testclient import TestClient

from app.errors import GarminAuthenticationRequired
from app.main import create_app
from app.models import (
    ActivitiesResponse,
    ActivityResponse,
    DailyRecoveryResponse,
    DevicesResponse,
    DeviceResponse,
    LatestActivityResponse,
    ProfileResponse,
    TrainingStatusResponse,
    WorkoutPushResponse,
    WorkoutScheduleResponse,
    WorkoutUploadResponse,
)


class _FakeGateway:
    def profile(self) -> ProfileResponse:
        return ProfileResponse(display_name="athlete", unit_system="metric")

    def activities(
        self,
        *,
        start: int,
        limit: int,
        activity_type: str | None,
    ) -> ActivitiesResponse:
        assert activity_type in {None, "running"}
        return ActivitiesResponse(
            activities=[
                ActivityResponse(
                    activity_id="101",
                    activity_type="running",
                    title="Easy run",
                    start_time=datetime(2026, 7, 28, 7, tzinfo=UTC),
                )
            ],
            start=start,
            limit=limit,
            returned=1,
        )

    def latest_activity(self) -> LatestActivityResponse:
        return LatestActivityResponse(
            activity=ActivityResponse(
                activity_id="101",
                activity_type="running",
            )
        )

    def recovery(self, snapshot_date: date) -> DailyRecoveryResponse:
        return DailyRecoveryResponse(date=snapshot_date, sleep_score=84)

    def training_status(self, snapshot_date: date) -> TrainingStatusResponse:
        return TrainingStatusResponse(date=snapshot_date, status="PRODUCTIVE")

    def devices(self) -> DevicesResponse:
        return DevicesResponse(
            devices=[DeviceResponse(user_device_id="456", display_name="Forerunner")]
        )

    def upload_workout(self, request) -> WorkoutUploadResponse:
        return WorkoutUploadResponse(workout_id="777", name=request.name)

    def schedule_workout(
        self,
        workout_id: str,
        schedule_date: date,
    ) -> WorkoutScheduleResponse:
        return WorkoutScheduleResponse(
            workout_id=workout_id,
            workout_schedule_id="888",
            date=schedule_date,
        )

    def push_workout(
        self,
        workout_id: str,
        *,
        device_id: str | None,
    ) -> WorkoutPushResponse:
        return WorkoutPushResponse(
            workout_id=workout_id,
            device_id=device_id or "456",
        )


def _client() -> TestClient:
    return TestClient(create_app(_FakeGateway()))  # type: ignore[arg-type]


def test_read_endpoints_return_normalized_camel_case_models() -> None:
    with _client() as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/profile").json() == {
            "displayName": "athlete",
            "fullName": None,
            "location": None,
            "country": None,
            "timeZone": None,
            "unitSystem": "metric",
        }

        activities = client.get(
            "/activities",
            params={"activityType": "running", "limit": 5},
        )
        assert activities.status_code == 200
        assert activities.json()["activities"][0]["activityId"] == "101"
        assert activities.json()["limit"] == 5

        assert (
            client.get("/activities/latest").json()["activity"]["activityId"]
            == "101"
        )
        assert (
            client.get("/recovery/2026-07-28").json()["sleepScore"] == 84
        )
        assert (
            client.get("/training-status", params={"date": "2026-07-28"})
            .json()["status"]
            == "PRODUCTIVE"
        )
        assert client.get("/devices").json()["devices"][0]["userDeviceId"] == "456"


def test_workout_upload_schedule_and_push_contract() -> None:
    payload = {
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
    with _client() as client:
        upload = client.post("/workouts", json=payload)
        schedule = client.post(
            "/workouts/777/schedule",
            json={"date": "2026-08-02"},
        )
        push = client.post("/workouts/777/push", json={})

    assert upload.status_code == 201
    assert upload.json() == {
        "workoutId": "777",
        "name": "Sunday easy",
        "status": "uploaded",
    }
    assert schedule.json() == {
        "workoutId": "777",
        "workoutScheduleId": "888",
        "date": "2026-08-02",
        "status": "scheduled",
    }
    assert push.json() == {
        "workoutId": "777",
        "deviceId": "456",
        "accepted": True,
    }


def test_validation_rejects_invalid_ids_and_workout_ranges() -> None:
    with _client() as client:
        invalid_id = client.post(
            "/workouts/not-a-number/schedule",
            json={"date": "2026-08-02"},
        )
        invalid_pace = client.post(
            "/workouts",
            json={
                "name": "Invalid",
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
            },
        )

    assert invalid_id.status_code == 422
    assert invalid_pace.status_code == 422


def test_bridge_errors_expose_only_safe_message() -> None:
    class _FailingGateway(_FakeGateway):
        def profile(self) -> ProfileResponse:
            raise GarminAuthenticationRequired("private upstream response")

    with TestClient(create_app(_FailingGateway())) as client:  # type: ignore[arg-type]
        response = client.get("/profile")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "garmin_authentication_required"
    assert "private upstream response" not in response.text


def test_configured_bridge_token_protects_account_data_but_not_health() -> None:
    app = create_app(_FakeGateway(), api_token="server-secret")  # type: ignore[arg-type]
    with TestClient(app) as client:
        health = client.get("/health")
        missing = client.get("/profile")
        wrong = client.get(
            "/profile",
            headers={"Authorization": "Bearer incorrect"},
        )
        valid = client.get(
            "/profile",
            headers={"Authorization": "Bearer server-secret"},
        )

    assert health.status_code == 200
    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert valid.status_code == 200
    assert "server-secret" not in missing.text
