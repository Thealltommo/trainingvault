import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toGarminRunningWorkoutRequest } from "@/lib/garmin";
import {
  GarminBridgeRequestError,
  GarminRequestBodyError,
  garminBridgeFetch,
  isoDateSchema,
  parseBoundedJsonBody,
  requireGarminApiAuth,
  workoutPushResponseSchema,
  workoutScheduleResponseSchema,
  workoutUploadResponseSchema,
} from "@/lib/garmin-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const durationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("time"), seconds: z.number().finite().positive() }).strict(),
  z.object({ type: z.literal("distance"), meters: z.number().finite().positive() }).strict(),
  z.object({ type: z.literal("open") }).strict(),
]);

const targetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }).strict(),
  z
    .object({
      type: z.literal("pace"),
      fastestSecondsPerKm: z.number().finite().positive(),
      slowestSecondsPerKm: z.number().finite().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal("heart_rate"),
      minimumBpm: z.number().int(),
      maximumBpm: z.number().int(),
    })
    .strict(),
]);

const stepSchema = z
  .object({
    kind: z.literal("step"),
    phase: z.enum(["warmup", "work", "recovery", "cooldown"]),
    duration: durationSchema,
    target: targetSchema,
    description: z.string().max(512).optional(),
  })
  .strict();

const elementSchema = z.discriminatedUnion("kind", [
  stepSchema,
  z
    .object({
      kind: z.literal("repeat"),
      repetitions: z.number().int(),
      steps: z.array(stepSchema).min(1).max(20),
    })
    .strict(),
]);

const numericGarminId = z.string().regex(/^[1-9]\d{0,31}$/);
const workoutCleanupResponseSchema = z
  .object({ status: z.literal("deleted"), workoutId: numericGarminId })
  .strict();
const scheduleCleanupResponseSchema = z
  .object({
    status: z.literal("unscheduled"),
    workoutScheduleId: numericGarminId,
  })
  .strict();

const sendWorkoutRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(160),
    scheduledDate: isoDateSchema,
    pushToDevice: z.boolean().default(false),
    replaceExisting: z.boolean().default(false),
    deviceId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_.:-]+$/)
      .nullable()
      .optional(),
    garminWorkoutId: numericGarminId.nullable().optional(),
    workoutScheduleId: numericGarminId.nullable().optional(),
    workout: z
      .object({
        id: z.string().trim().min(1).max(160),
        name: z.string().min(1).max(120),
        date: isoDateSchema.optional(),
        description: z.string().max(1_024).optional(),
        estimatedDurationSeconds: z.number().finite().positive().optional(),
        steps: z.array(elementSchema).min(1).max(100),
      })
      .strict(),
  })
  .strict();

function failureResponse(
  error: unknown,
  stage: "upload" | "schedule" | "push",
  values: {
    sessionId: string;
    scheduledDate: string;
    garminWorkoutId: string | null;
    workoutScheduleId: string | null;
    deviceId: string | null;
  },
) {
  const knownError =
    error instanceof GarminBridgeRequestError ||
    error instanceof GarminRequestBodyError;
  const status = knownError ? error.httpStatus : 500;
  const message = knownError
    ? error.publicMessage
    : "The Garmin operation failed.";

  return NextResponse.json(
    {
      ...values,
      state: "error",
      failedStage: stage,
      error: message,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireGarminApiAuth(request);

  if (unauthorized) {
    return unauthorized;
  }

  let input: z.infer<typeof sendWorkoutRequestSchema>;

  try {
    input = await parseBoundedJsonBody(
      request,
      sendWorkoutRequestSchema,
      131_072,
    );
  } catch (error) {
    const status =
      error instanceof GarminRequestBodyError ? error.httpStatus : 400;
    const message =
      error instanceof GarminRequestBodyError
        ? error.publicMessage
        : "The Garmin request was invalid.";
    return NextResponse.json({ error: message }, { status });
  }

  let converted: ReturnType<typeof toGarminRunningWorkoutRequest>;

  try {
    converted = toGarminRunningWorkoutRequest(input.workout);
  } catch {
    return NextResponse.json(
      {
        error:
          "The structured run contains an unsupported duration, target, or repeat.",
      },
      { status: 400 },
    );
  }

  const previousGarminWorkoutId =
    input.replaceExisting ? input.garminWorkoutId ?? null : null;
  const previousWorkoutScheduleId =
    input.replaceExisting ? input.workoutScheduleId ?? null : null;
  let garminWorkoutId = input.replaceExisting
    ? null
    : input.garminWorkoutId ?? null;
  let workoutScheduleId = input.replaceExisting
    ? null
    : input.workoutScheduleId ?? null;
  let deviceId = input.deviceId ?? null;
  const responseBase = {
    sessionId: input.sessionId,
    scheduledDate: input.scheduledDate,
  };

  if (!garminWorkoutId) {
    try {
      const uploaded = await garminBridgeFetch(
        "/workouts",
        workoutUploadResponseSchema,
        {
          method: "POST",
          body: JSON.stringify(converted),
        },
        30_000,
      );
      garminWorkoutId = uploaded.workoutId;
    } catch (error) {
      return failureResponse(error, "upload", {
        ...responseBase,
        garminWorkoutId,
        workoutScheduleId,
        deviceId,
      });
    }
  }

  if (!workoutScheduleId) {
    try {
      const scheduled = await garminBridgeFetch(
        `/workouts/${encodeURIComponent(garminWorkoutId)}/schedule`,
        workoutScheduleResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({ date: input.scheduledDate }),
        },
        30_000,
      );

      if (scheduled.workoutId !== garminWorkoutId) {
        throw new GarminBridgeRequestError(
          502,
          "Garmin returned a mismatched workout identifier.",
        );
      }

      workoutScheduleId = scheduled.workoutScheduleId;
    } catch (error) {
      return failureResponse(error, "schedule", {
        ...responseBase,
        garminWorkoutId,
        workoutScheduleId,
        deviceId,
      });
    }
  }

  let replacementWarning: string | null = null;

  if (input.replaceExisting) {
    let oldScheduleRemoved = previousWorkoutScheduleId === null;

    if (previousWorkoutScheduleId) {
      try {
        await garminBridgeFetch(
          `/workout-schedules/${encodeURIComponent(previousWorkoutScheduleId)}`,
          scheduleCleanupResponseSchema,
          { method: "DELETE" },
          20_000,
        );
        oldScheduleRemoved = true;
      } catch {
        replacementWarning =
          "The new workout is scheduled, but Garmin did not confirm removal of the previous calendar entry. Check Garmin Connect for a duplicate.";
      }
    }

    if (
      previousGarminWorkoutId &&
      oldScheduleRemoved &&
      previousGarminWorkoutId !== garminWorkoutId
    ) {
      try {
        await garminBridgeFetch(
          `/workouts/${encodeURIComponent(previousGarminWorkoutId)}`,
          workoutCleanupResponseSchema,
          { method: "DELETE" },
          20_000,
        );
      } catch {
        replacementWarning ??=
          "The new workout is scheduled and the old calendar entry was removed, but Garmin kept the previous workout template in the library.";
      }
    }
  }

  if (input.pushToDevice) {
    try {
      const pushed = await garminBridgeFetch(
        `/workouts/${encodeURIComponent(garminWorkoutId)}/push`,
        workoutPushResponseSchema,
        {
          method: "POST",
          body: JSON.stringify(deviceId ? { deviceId } : {}),
        },
        30_000,
      );

      if (pushed.workoutId !== garminWorkoutId) {
        throw new GarminBridgeRequestError(
          502,
          "Garmin returned a mismatched workout identifier.",
        );
      }

      deviceId = pushed.deviceId;

      return NextResponse.json({
        ...responseBase,
        state: "sent_to_device",
        garminWorkoutId,
        workoutScheduleId,
        deviceId,
        replacementWarning,
      });
    } catch (error) {
      return failureResponse(error, "push", {
        ...responseBase,
        garminWorkoutId,
        workoutScheduleId,
        deviceId,
      });
    }
  }

  return NextResponse.json({
    ...responseBase,
    state: "scheduled",
    garminWorkoutId,
    workoutScheduleId,
    deviceId: null,
    replacementWarning,
  });
}
