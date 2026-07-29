import type {
  Programme,
  SessionLog,
  WorkoutOverride,
} from "../../lib/types";
import type { AthleteSession } from "../../lib/athlete";
import { adaptLegacyProgramme } from "../../lib/athlete";

export const legacyProgramme: Programme = {
  id: "legacy-plan",
  name: "Legacy plan",
  description: "Adapter fixture",
  durationWeeks: 1,
  startDate: "2026-08-03",
  weeks: [
    {
      id: "week-1",
      weekNumber: 1,
      title: "Build",
      days: [
        {
          id: "day-1",
          dayNumber: 1,
          label: "Monday",
          workout: {
            id: "threshold-run",
            title: "Threshold Run",
            category: "track",
            durationMinutes: 60,
            minimumMinutes: 30,
            intensity: "hard",
            date: "2026-08-03",
            prescribedLoadsOrPace: "4:00-4:10/km",
            targetStimulus: "Controlled threshold",
            focus: ["threshold", "run economy"],
            equipment: ["road", "watch"],
            blocks: [
              {
                name: "Warmup",
                type: "warmup",
                durationMinutes: 15,
                items: ["Easy jog", "4 strides"],
              },
              {
                name: "Intervals",
                type: "intervals",
                durationMinutes: 35,
                items: ["4 x 6 min threshold", "2 min easy recovery"],
              },
              {
                name: "Cooldown",
                type: "cooldown",
                durationMinutes: 10,
                items: ["Easy jog"],
              },
            ],
          },
        },
      ],
    },
  ],
};

export const legacyOverride: WorkoutOverride = {
  workoutId: "threshold-run",
  date: "2026-08-04",
  durationMinutes: 45,
  modificationReason: "Heavy legs after Hawkeye",
  blocks: [
    {
      name: "Longer warmup",
      type: "warmup",
      durationMinutes: 15,
      items: ["Easy jog", "Mobility"],
    },
    {
      name: "Adjusted intervals",
      type: "intervals",
      durationMinutes: 20,
      items: ["3 x 5 min threshold", "2 min easy recovery"],
    },
    {
      name: "Cooldown",
      type: "cooldown",
      durationMinutes: 10,
      items: ["Easy jog"],
    },
  ],
  updatedAt: "2026-08-03T20:00:00.000Z",
};

export const legacyLog: SessionLog = {
  id: "log-1",
  workoutId: "threshold-run",
  workoutTitle: "Threshold Run",
  workoutCategory: "track",
  workoutDate: "2026-08-04",
  workoutModified: true,
  completedAt: "2026-08-04T17:30:00.000Z",
  rpe: 7,
  actualDurationMinutes: 43,
  result: "Controlled",
  blockResults: [
    {
      blockKey: "1-intervals",
      blockName: "Adjusted intervals",
      blockType: "intervals",
      status: "done",
      time: "15:00 work",
      distance: "4 km",
    },
  ],
};

export function athleteSession(options: {
  includeOverride?: boolean;
  includeLog?: boolean;
} = {}): AthleteSession {
  return adaptLegacyProgramme(legacyProgramme, {
    overrides: options.includeOverride
      ? { "threshold-run": legacyOverride }
      : {},
    logs: options.includeLog ? [legacyLog] : [],
    garminWorkoutIds: { "threshold-run": "garmin-workout-1" },
  })[0];
}
