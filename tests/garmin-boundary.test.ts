import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getActivities, POST as syncActivities } from "@/app/api/garmin/activities/route";
import { GET as getDevices } from "@/app/api/garmin/devices/route";
import { GET as getHealth } from "@/app/api/garmin/health/route";
import { GET as getRecovery } from "@/app/api/garmin/recovery/route";
import { POST as sendWorkout } from "@/app/api/garmin/workouts/route";
import {
  GarminBridgeRequestError,
  garminBridgeFetch,
  healthResponseSchema,
  parseBoundedJsonBody,
  validateGarminBridgeBaseUrl,
} from "@/lib/garmin-server";
import {
  analyseGarminPlannedVsActual,
  generateGarminPostRunCoachInsight,
  toGarminActivityMatchingSession,
  type GarminPlannedSession,
  type NormalizedGarminActivity,
} from "@/lib/garmin-storage";
import { z } from "zod";
import { AUTH_COOKIE, createAuthToken } from "@/lib/auth";

const originalSessionSecret = process.env.TRAINVAULT_SESSION_SECRET;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GARMIN_BRIDGE_URL;
  delete process.env.GARMIN_BRIDGE_API_KEY;
  if (originalSessionSecret === undefined) {
    delete process.env.TRAINVAULT_SESSION_SECRET;
  } else {
    process.env.TRAINVAULT_SESSION_SECRET = originalSessionSecret;
  }
});

describe("Garmin bridge URL policy", () => {
  it("allows HTTPS and loopback HTTP bridge origins", () => {
    expect(validateGarminBridgeBaseUrl("https://garmin.example.test").origin).toBe(
      "https://garmin.example.test",
    );
    expect(validateGarminBridgeBaseUrl("http://127.0.0.1:8000").origin).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("rejects insecure remote, credential-bearing, and path-bearing URLs", () => {
    for (const value of [
      "http://garmin.example.test",
      "https://user:password@garmin.example.test",
      "https://garmin.example.test/proxy",
      "https://garmin.example.test?token=unsafe",
    ]) {
      expect(() => validateGarminBridgeBaseUrl(value)).toThrow(
        GarminBridgeRequestError,
      );
    }
  });
});

describe("Garmin server request boundary", () => {
  it("enforces the request body size before parsing JSON", async () => {
    const request = new Request("http://localhost/api/garmin/workouts", {
      method: "POST",
      body: JSON.stringify({ value: "too large" }),
      headers: {
        "content-length": "5000",
        "content-type": "application/json",
      },
    });

    await expect(
      parseBoundedJsonBody(
        request,
        z.object({ value: z.string() }).strict(),
        100,
      ),
    ).rejects.toMatchObject({
      httpStatus: 413,
    });
  });

  it("keeps the bridge token server-side and validates normalized JSON", async () => {
    process.env.GARMIN_BRIDGE_URL = "https://garmin.example.test";
    process.env.GARMIN_BRIDGE_API_KEY = "server-token-for-test";
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer server-token-for-test");
      return Response.json({
        status: "ok",
        service: "trainvault-garmin-bridge",
        version: "0.1.0",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      garminBridgeFetch("/health", healthResponseSchema),
    ).resolves.toEqual({
      status: "ok",
      service: "trainvault-garmin-bridge",
      version: "0.1.0",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("Garmin Next API authentication", () => {
  it("rejects every Garmin route operation without a signed session", async () => {
    const cases = [
      {
        handler: getHealth,
        request: new NextRequest("http://localhost/api/garmin/health"),
      },
      {
        handler: getDevices,
        request: new NextRequest("http://localhost/api/garmin/devices"),
      },
      {
        handler: getRecovery,
        request: new NextRequest(
          "http://localhost/api/garmin/recovery?date=2026-08-02",
        ),
      },
      {
        handler: getActivities,
        request: new NextRequest("http://localhost/api/garmin/activities"),
      },
      {
        handler: syncActivities,
        request: new NextRequest("http://localhost/api/garmin/activities", {
          method: "POST",
          body: "{}",
        }),
      },
      {
        handler: sendWorkout,
        request: new NextRequest("http://localhost/api/garmin/workouts", {
          method: "POST",
          body: "{}",
        }),
      },
    ];

    for (const testCase of cases) {
      const response = await testCase.handler(testCase.request);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Unauthorized",
      });
    }
  });

  it("orchestrates upload, schedule, and device push only after real responses", async () => {
    process.env.TRAINVAULT_SESSION_SECRET = "garmin-route-test-secret";
    process.env.GARMIN_BRIDGE_URL = "https://garmin.example.test";
    process.env.GARMIN_BRIDGE_API_KEY = "server-token-for-test";
    const token = await createAuthToken();
    const upstreamResponses = [
      {
        status: 201,
        body: {
          workoutId: "12345",
          name: "Sunday intervals",
          status: "uploaded",
        },
      },
      {
        status: 200,
        body: {
          workoutId: "12345",
          workoutScheduleId: "67890",
          date: "2026-08-02",
          status: "scheduled",
        },
      },
      {
        status: 200,
        body: {
          workoutId: "12345",
          deviceId: "device-7",
          accepted: true,
        },
      },
    ];
    const fetchMock = vi.fn(async () => {
      const next = upstreamResponses.shift();

      if (!next) {
        throw new Error("Unexpected upstream request");
      }

      return Response.json(next.body, { status: next.status });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await sendWorkout(
      new NextRequest("http://localhost/api/garmin/workouts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${AUTH_COOKIE}=${token}`,
        },
        body: JSON.stringify({
          sessionId: "run-sunday",
          scheduledDate: "2026-08-02",
          pushToDevice: true,
          deviceId: "device-7",
          workout: {
            id: "run-sunday",
            name: "Sunday intervals",
            estimatedDurationSeconds: 3_600,
            steps: [
              {
                kind: "step",
                phase: "work",
                duration: { type: "time", seconds: 3_600 },
                target: { type: "open" },
              },
            ],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "sent_to_device",
      garminWorkoutId: "12345",
      workoutScheduleId: "67890",
      deviceId: "device-7",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Garmin planned versus actual", () => {
  it("sends only matching fields through the strict activity-sync boundary", () => {
    const matchingSession = toGarminActivityMatchingSession({
      sessionId: "run-sunday",
      title: "Sunday easy run",
      date: "2026-08-02",
      plannedDurationSeconds: 2_700,
      plannedDistanceMeters: null,
      plannedPaceSecondsPerKm: 345,
      plannedHeartRateRange: [130, 145],
      plannedElevationMeters: 80,
      plannedIntervalCount: null,
    });

    expect(matchingSession).toEqual({
      sessionId: "run-sunday",
      title: "Sunday easy run",
      date: "2026-08-02",
      plannedStartTime: undefined,
      plannedDistanceMeters: null,
      plannedDurationSeconds: 2_700,
      garminWorkoutId: undefined,
    });
    expect(matchingSession).not.toHaveProperty("plannedPaceSecondsPerKm");
    expect(matchingSession).not.toHaveProperty("plannedHeartRateRange");
  });

  it("reports bounded comparable metrics without inventing RPE", () => {
    const planned: GarminPlannedSession = {
      sessionId: "run-sunday",
      title: "Sunday intervals",
      date: "2026-08-02",
      plannedDurationSeconds: 3_600,
      plannedDistanceMeters: 10_000,
      plannedPaceSecondsPerKm: 360,
      plannedHeartRateRange: [140, 155],
      plannedElevationMeters: 80,
      plannedIntervalCount: 6,
    };
    const activity: NormalizedGarminActivity = {
      activityId: "activity-1",
      activityType: "running",
      title: "Sunday intervals",
      startTime: "2026-08-02T08:00:00Z",
      localStartTime: "2026-08-02T09:00:00",
      durationSeconds: 3_300,
      movingDurationSeconds: 3_250,
      distanceMeters: 9_800,
      averageSpeedMps: 2.97,
      averagePaceSecondsPerKm: 330,
      averageHeartRateBpm: 148,
      maxHeartRateBpm: 170,
      averageCadenceSpm: 176,
      elevationGainMeters: 100,
      elevationLossMeters: 96,
      calories: 620,
      aerobicTrainingEffect: 3.4,
      anaerobicTrainingEffect: 1.5,
      garminWorkoutId: "12345",
      laps: Array.from({ length: 5 }, (_, index) => ({
        lapIndex: index + 1,
        durationSeconds: 300,
        distanceMeters: 800,
        averagePaceSecondsPerKm: 240,
        averageHeartRateBpm: 158,
      })),
    };

    const result = analyseGarminPlannedVsActual(planned, activity);

    expect(result.adherence).toBe("on_target");
    expect(result.durationDeltaMinutes).toBe(-5);
    expect(result.distanceDeltaMeters).toBe(-200);
    expect(result.paceDeltaSecondsPerKm).toBe(-30);
    expect(result.heartRateAssessment).toBe("Within target range");
    expect(result.elevationDeltaMeters).toBe(20);
    expect(result.recordedLapCount).toBe(5);
    expect(result.observations.at(-1)).toBe(
      "Add subjective RPE in the TrainVault session log.",
    );
    expect(generateGarminPostRunCoachInsight(result)).toMatchObject({
      title: "Prescription substantially completed",
      confidence: "Basic · 6 comparable fields",
    });
  });
});
