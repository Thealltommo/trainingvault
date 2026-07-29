from datetime import UTC, date

import pytest

from app.normalizers import (
    normalize_activity,
    normalize_device,
    normalize_profile,
    normalize_recovery,
    normalize_training_status,
)


def test_normalize_activity_converts_units_and_nullable_metrics() -> None:
    activity = normalize_activity(
        {
            "activityId": 123456,
            "activityName": "Threshold 800s",
            "activityType": {"typeKey": "running"},
            "startTimeGMT": "2026-07-27 17:30:00",
            "startTimeLocal": "2026-07-27 18:30:00",
            "duration": 3_000.0,
            "movingDuration": 2_950.0,
            "distance": 10_000.0,
            "averageSpeed": 4.0,
            "averageHR": 161,
            "maxHR": 183,
            "averageRunningCadenceInStepsPerMinute": 178,
            "elevationGain": 82,
            "elevationLoss": 80,
            "calories": 722,
            "aerobicTrainingEffect": 4.1,
            "anaerobicTrainingEffect": 2.4,
            "workoutId": 9988,
        }
    )

    assert activity.activity_id == "123456"
    assert activity.activity_type == "running"
    assert activity.start_time is not None
    assert activity.start_time.tzinfo == UTC
    assert activity.local_start_time is not None
    assert activity.local_start_time.tzinfo is None
    assert activity.average_pace_seconds_per_km == pytest.approx(250.0)
    assert activity.garmin_workout_id == "9988"
    assert activity.laps is None


def test_normalize_profile_does_not_expose_email_or_account_id() -> None:
    profile = normalize_profile(
        {
            "displayName": "athlete",
            "fullName": "Train Vault",
            "emailAddress": "private@example.test",
            "profileId": 42,
            "measurementSystem": "metric",
            "timeZone": "Europe/London",
        }
    )

    assert profile.display_name == "athlete"
    assert profile.unit_system == "metric"
    assert "private@example.test" not in profile.model_dump_json()
    assert "42" not in profile.model_dump_json()


def test_normalize_recovery_combines_nested_shapes_and_marks_partial() -> None:
    recovery = normalize_recovery(
        date(2026, 7, 28),
        stats={"restingHeartRate": 47, "averageStressLevel": 24},
        hrv={
            "hrvSummary": {
                "lastNightAvg": 68,
                "weeklyAvg": 64,
                "status": "BALANCED",
            }
        },
        sleep={
            "dailySleepDTO": {
                "sleepTimeSeconds": 27_000,
                "deepSleepSeconds": 5_400,
                "remSleepSeconds": 7_200,
                "sleepScores": {"overall": {"value": 86}},
            }
        },
        body_battery=[
            {
                "bodyBatteryValuesArray": [
                    [1_722_169_200_000, "measured", 23],
                    [1_722_190_800_000, "measured", 81],
                ]
            }
        ],
        readiness=[
            {"score": 61, "inputContext": "DURING_DAY"},
            {
                "score": 84,
                "level": "HIGH",
                "feedbackLong": "Recovered for quality work",
                "inputContext": "AFTER_WAKEUP_RESET",
            },
        ],
        unavailable_metrics=["race_predictions"],
    )

    assert recovery.sleep_score == 86
    assert recovery.body_battery_current == 81
    assert recovery.body_battery_high == 81
    assert recovery.body_battery_low == 23
    assert recovery.training_readiness_score == 84
    assert recovery.partial is True
    assert recovery.unavailable_metrics == ["race_predictions"]


def test_normalize_recovery_allows_every_metric_to_be_absent() -> None:
    recovery = normalize_recovery(date(2026, 7, 28))

    assert recovery.resting_heart_rate_bpm is None
    assert recovery.hrv_last_night_ms is None
    assert recovery.sleep_score is None
    assert recovery.training_readiness_score is None
    assert recovery.partial is False


def test_training_status_and_device_normalization() -> None:
    status = normalize_training_status(
        date(2026, 7, 28),
        {
            "mostRecentTrainingStatus": {
                "latestTrainingStatusData": {
                    "trainingStatus": "PRODUCTIVE",
                    "trainingStatusFeedbackPhrase": "LOAD_FOCUS_OPTIMAL",
                    "loadLevelTrend": "OPTIMAL",
                    "loadRatio": 1.1,
                    "acuteLoad": 614,
                    "chronicLoad": 570,
                    "vo2MaxPreciseValue": 57.4,
                }
            }
        },
    )
    device = normalize_device(
        {
            "deviceId": 10,
            "userDeviceId": 20,
            "displayName": "Forerunner",
            "productType": "forerunner965",
            "primary": True,
            "lastSyncTimeGMT": "2026-07-28T07:00:00Z",
        }
    )

    assert status.status == "PRODUCTIVE"
    assert status.load_ratio == pytest.approx(1.1)
    assert status.vo2_max == pytest.approx(57.4)
    assert device.device_id == "10"
    assert device.user_device_id == "20"
    assert device.primary is True
    assert device.last_sync_time is not None
    assert device.last_sync_time.tzinfo == UTC
