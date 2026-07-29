import assert from "node:assert/strict";
import test from "node:test";

import { toGarminRunningWorkoutRequest } from "../workout-converter.ts";

test("converts a structured 6 x 800 m workout without losing prescription", () => {
  const source = {
    id: "session-1",
    name: "  6 x 800 m  ",
    date: "2026-08-02",
    steps: [
      {
        kind: "step",
        phase: "warmup",
        duration: { type: "time", seconds: 900 },
        target: { type: "open" },
      },
      {
        kind: "repeat",
        repetitions: 6,
        steps: [
          {
            kind: "step",
            phase: "work",
            duration: { type: "distance", meters: 800 },
            target: {
              type: "pace",
              fastestSecondsPerKm: 238,
              slowestSecondsPerKm: 243,
            },
          },
          {
            kind: "step",
            phase: "recovery",
            duration: { type: "time", seconds: 120 },
            target: { type: "open" },
          },
        ],
      },
      {
        kind: "step",
        phase: "cooldown",
        duration: { type: "time", seconds: 600 },
        target: { type: "open" },
      },
    ],
  };

  const result = toGarminRunningWorkoutRequest(source);

  assert.equal(result.name, "6 x 800 m");
  assert.equal(result.estimatedDurationSeconds, 3374);
  assert.deepEqual(result.steps, source.steps);
  assert.notEqual(result.steps, source.steps);
});

test("requires an explicit estimate for open steps", () => {
  assert.throws(
    () =>
      toGarminRunningWorkoutRequest({
        id: "session-2",
        name: "Open progression",
        steps: [
          {
            kind: "step",
            phase: "work",
            duration: { type: "open" },
            target: { type: "open" },
          },
        ],
      }),
    /estimatedDurationSeconds/,
  );
});

test("rejects inverted pace bounds", () => {
  assert.throws(
    () =>
      toGarminRunningWorkoutRequest({
        id: "session-3",
        name: "Invalid",
        steps: [
          {
            kind: "step",
            phase: "work",
            duration: { type: "time", seconds: 60 },
            target: {
              type: "pace",
              fastestSecondsPerKm: 300,
              slowestSecondsPerKm: 240,
            },
          },
        ],
      }),
    /fastestSecondsPerKm/,
  );
});
