import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { isAuthorizedRequest } from "@/lib/auth";

const MAX_UPSTREAM_RESPONSE_BYTES = 1_048_576;
const LOCAL_BRIDGE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a real calendar date.");

const nullableFiniteNumber = z.number().finite().nullable();
const nullableText = z.string().nullable();

export const activityLapSchema = z
  .object({
    lapIndex: z.number().int().nonnegative().nullable(),
    durationSeconds: nullableFiniteNumber,
    distanceMeters: nullableFiniteNumber,
    averagePaceSecondsPerKm: nullableFiniteNumber,
    averageHeartRateBpm: nullableFiniteNumber,
  })
  .strict();

export const garminActivitySchema = z
  .object({
    activityId: nullableText,
    activityType: nullableText,
    title: nullableText,
    startTime: nullableText,
    localStartTime: nullableText,
    durationSeconds: nullableFiniteNumber,
    movingDurationSeconds: nullableFiniteNumber,
    distanceMeters: nullableFiniteNumber,
    averageSpeedMps: nullableFiniteNumber,
    averagePaceSecondsPerKm: nullableFiniteNumber,
    averageHeartRateBpm: nullableFiniteNumber,
    maxHeartRateBpm: nullableFiniteNumber,
    averageCadenceSpm: nullableFiniteNumber,
    elevationGainMeters: nullableFiniteNumber,
    elevationLossMeters: nullableFiniteNumber,
    calories: nullableFiniteNumber,
    aerobicTrainingEffect: nullableFiniteNumber,
    anaerobicTrainingEffect: nullableFiniteNumber,
    garminWorkoutId: nullableText,
    laps: z.array(activityLapSchema).max(2_000).nullable(),
  })
  .strict();

export const activitiesResponseSchema = z
  .object({
    activities: z.array(garminActivitySchema).max(100),
    start: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
    returned: z.number().int().nonnegative().max(100),
  })
  .strict();

export const recoveryResponseSchema = z
  .object({
    date: isoDateSchema,
    restingHeartRateBpm: nullableFiniteNumber,
    hrvLastNightMs: nullableFiniteNumber,
    hrvWeeklyAverageMs: nullableFiniteNumber,
    hrvStatus: nullableText,
    sleepScore: nullableFiniteNumber,
    sleepDurationSeconds: nullableFiniteNumber,
    deepSleepSeconds: nullableFiniteNumber,
    remSleepSeconds: nullableFiniteNumber,
    averageStressLevel: nullableFiniteNumber,
    bodyBatteryCurrent: nullableFiniteNumber,
    bodyBatteryHigh: nullableFiniteNumber,
    bodyBatteryLow: nullableFiniteNumber,
    trainingReadinessScore: nullableFiniteNumber,
    trainingReadinessLevel: nullableText,
    trainingReadinessFeedback: nullableText,
    partial: z.boolean(),
    unavailableMetrics: z.array(z.string().max(80)).max(30),
  })
  .strict();

export const trainingStatusResponseSchema = z
  .object({
    date: isoDateSchema,
    status: nullableText,
    feedback: nullableText,
    loadLevel: nullableText,
    loadRatio: nullableFiniteNumber,
    acuteLoad: nullableFiniteNumber,
    chronicLoad: nullableFiniteNumber,
    vo2Max: nullableFiniteNumber,
  })
  .strict();

export const devicesResponseSchema = z
  .object({
    devices: z
      .array(
        z
          .object({
            deviceId: nullableText,
            userDeviceId: nullableText,
            displayName: nullableText,
            model: nullableText,
            serialNumber: nullableText,
            primary: z.boolean().nullable(),
            lastSyncTime: nullableText,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export const workoutUploadResponseSchema = z
  .object({
    workoutId: z.string().regex(/^[1-9]\d{0,31}$/),
    name: z.string().min(1).max(80),
    status: z.literal("uploaded"),
  })
  .strict();

export const workoutScheduleResponseSchema = z
  .object({
    workoutId: z.string().regex(/^[1-9]\d{0,31}$/),
    workoutScheduleId: z.string().min(1).max(128),
    date: isoDateSchema,
    status: z.literal("scheduled"),
  })
  .strict();

export const workoutPushResponseSchema = z
  .object({
    workoutId: z.string().regex(/^[1-9]\d{0,31}$/),
    deviceId: z.string().min(1).max(128),
    accepted: z.literal(true),
  })
  .strict();

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("trainvault-garmin-bridge"),
    version: z.string().min(1).max(40),
  })
  .strict();

export class GarminBridgeRequestError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "GarminBridgeRequestError";
  }
}

export class GarminRequestBodyError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "GarminRequestBodyError";
  }
}

export function validateGarminBridgeBaseUrl(rawValue: string | undefined) {
  const raw = rawValue?.trim();

  if (!raw) {
    throw new GarminBridgeRequestError(
      503,
      "Garmin integration is not configured.",
    );
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new GarminBridgeRequestError(
      503,
      "Garmin bridge configuration is invalid.",
    );
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new GarminBridgeRequestError(
      503,
      "Garmin bridge configuration is invalid.",
    );
  }

  if (
    url.protocol === "http:" &&
    !LOCAL_BRIDGE_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new GarminBridgeRequestError(
      503,
      "The Garmin bridge must use HTTPS unless it runs on this machine.",
    );
  }

  return url;
}

function bridgeUrl(endpoint: string) {
  if (
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//") ||
    endpoint.includes("\\")
  ) {
    throw new GarminBridgeRequestError(
      500,
      "The Garmin bridge request was invalid.",
    );
  }

  const base = validateGarminBridgeBaseUrl(process.env.GARMIN_BRIDGE_URL);
  return new URL(endpoint, base.origin);
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array> | null,
  contentLength: string | null,
  maximumBytes: number,
) {
  const declaredLength = contentLength ? Number(contentLength) : null;

  if (
    declaredLength !== null &&
    Number.isFinite(declaredLength) &&
    declaredLength > maximumBytes
  ) {
    throw new GarminRequestBodyError(
      413,
      "The request or response body was too large.",
    );
  }

  if (!stream) {
    return "";
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bytes += value.byteLength;

      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new GarminRequestBodyError(
          413,
          "The request or response body was too large.",
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(bytes);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(combined);
}

export async function parseBoundedJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  maximumBytes = 131_072,
): Promise<T> {
  let text: string;

  try {
    text = await readBoundedStream(
      request.body,
      request.headers.get("content-length"),
      maximumBytes,
    );
  } catch (error) {
    if (error instanceof GarminRequestBodyError) {
      throw error;
    }

    throw new GarminRequestBodyError(400, "The request body could not be read.");
  }

  if (!text.trim()) {
    throw new GarminRequestBodyError(400, "A JSON request body is required.");
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new GarminRequestBodyError(400, "The request body must be valid JSON.");
  }

  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new GarminRequestBodyError(
      400,
      "The Garmin request did not match the expected shape.",
    );
  }

  return parsed.data;
}

function safeUpstreamError(status: number) {
  if (status === 401 || status === 403) {
    return new GarminBridgeRequestError(
      502,
      "The Garmin bridge rejected its server credential.",
    );
  }

  if (status === 429) {
    return new GarminBridgeRequestError(
      503,
      "Garmin is rate limiting requests. Try again shortly.",
    );
  }

  if (status >= 400 && status < 500) {
    return new GarminBridgeRequestError(
      502,
      "Garmin rejected the requested operation.",
    );
  }

  return new GarminBridgeRequestError(
    502,
    "The Garmin bridge could not complete the operation.",
  );
}

export async function garminBridgeFetch<T>(
  endpoint: string,
  schema: ZodType<T>,
  init: RequestInit = {},
  timeoutMilliseconds = 15_000,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (init.body !== undefined && init.body !== null) {
    headers.set("content-type", "application/json");
  }

  const apiKey = process.env.GARMIN_BRIDGE_API_KEY?.trim();

  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  let response: Response;

  try {
    response = await fetch(bridgeUrl(endpoint), {
      ...init,
      cache: "no-store",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new GarminBridgeRequestError(
        504,
        "The Garmin bridge timed out.",
      );
    }

    if (error instanceof GarminBridgeRequestError) {
      throw error;
    }

    throw new GarminBridgeRequestError(
      502,
      "The Garmin bridge is unavailable.",
    );
  }

  let text: string;

  try {
    text = await readBoundedStream(
      response.body,
      response.headers.get("content-length"),
      MAX_UPSTREAM_RESPONSE_BYTES,
    );
  } catch {
    throw new GarminBridgeRequestError(
      502,
      "The Garmin bridge returned an invalid response.",
    );
  }

  if (!response.ok) {
    throw safeUpstreamError(response.status);
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new GarminBridgeRequestError(
      502,
      "The Garmin bridge returned invalid JSON.",
    );
  }

  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new GarminBridgeRequestError(
      502,
      "The Garmin bridge returned an unexpected response.",
    );
  }

  return parsed.data;
}

export async function requireGarminApiAuth(request: NextRequest) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function garminErrorResponse(error: unknown) {
  if (
    error instanceof GarminBridgeRequestError ||
    error instanceof GarminRequestBodyError
  ) {
    return NextResponse.json(
      { error: error.publicMessage },
      { status: error.httpStatus },
    );
  }

  return NextResponse.json(
    { error: "The Garmin operation failed." },
    { status: 500 },
  );
}
