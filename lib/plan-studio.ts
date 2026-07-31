import type { StructuredRunningElement, StructuredRunningWorkout } from "@/lib/garmin/types";
import type { AthleteSessionType } from "@/lib/planning-storage";
import type { WorkoutIntensity } from "@/lib/types";

export type PlanStudioGoal = "5k" | "10k" | "half" | "spartan" | "hybrid";

export type PlanStudioConfig = {
  goal: PlanStudioGoal;
  startDate: string;
  targetDate?: string;
  targetLabel?: string;
  weeks: 8 | 10 | 12;
  runDays: number[];
  longRunDay: number;
  hawkeyeDays: number[];
  currentFiveK?: string;
  targetFiveK?: string;
};

export type PlanStudioSession = {
  id: string;
  week: number;
  date: string;
  title: string;
  type: AthleteSessionType;
  durationMinutes: number;
  minimumMinutes: number;
  intensity: WorkoutIntensity;
  prescription: string;
  targetStimulus: string;
  role: "quality" | "easy" | "long" | "hybrid";
};

type PlannedRunRole = "quality" | "quality_alt" | "easy" | "long";

const DAY_MS = 86_400_000;

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonday(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * DAY_MS);
}

function sessionForRole(
  goal: PlanStudioGoal,
  role: PlannedRunRole,
  week: number,
  recoveryWeek: boolean,
) {
  const build = recoveryWeek ? 0.82 : 1;
  const progression = Math.min(1.22, 1 + (week - 1) * 0.025);
  const factor = build * progression;

  if (role === "easy") {
    return {
      title: recoveryWeek ? "Reduced easy aerobic run" : "Easy aerobic run",
      duration: Math.round(42 * factor),
      minimum: 25,
      intensity: "easy" as const,
      prescription:
        "10 min relaxed\nEasy conversational running\nFinish with 4 × 15 sec relaxed strides if legs feel good",
      stimulus: "Aerobic volume with low mechanical and nervous-system cost.",
    };
  }

  if (role === "long") {
    const base = goal === "half" ? 78 : goal === "spartan" ? 82 : goal === "hybrid" ? 68 : 62;
    return {
      title:
        goal === "spartan"
          ? recoveryWeek
            ? "Reduced long trail / fell run"
            : "Long trail / fell run"
          : recoveryWeek
            ? "Reduced long aerobic run"
            : "Long aerobic run",
      duration: Math.round(base * factor),
      minimum: Math.round(base * 0.65),
      intensity: "easy" as const,
      prescription:
        goal === "spartan"
          ? "Keep effort controlled on climbs\nAccumulate useful vertical\nDescend smoothly; do not chase pace on technical ground"
          : "Keep the first two thirds conversational\nFinish steady only if mechanics remain relaxed",
      stimulus:
        goal === "spartan"
          ? "Mountain durability, climbing economy and eccentric tolerance."
          : "Endurance and fatigue resistance without turning the long run into a race.",
    };
  }

  if (goal === "5k") {
    const intervalDay = role === "quality_alt";
    if (intervalDay) {
      return recoveryWeek
        ? {
            title: "Reduced 5K rhythm intervals",
            duration: 44,
            minimum: 30,
            intensity: "moderate" as const,
            prescription:
              "12 min warm-up\n4 × 3 min at controlled 5K–10K effort / 2 min easy\n10 min cool-down",
            stimulus:
              "Keep 5K rhythm present while cutting the quality dose during the first reassessment week.",
          }
        : {
            title: "5K rhythm intervals",
            duration: Math.round(52 * Math.min(1.08, progression)),
            minimum: 32,
            intensity: "hard" as const,
            prescription:
              "12 min warm-up\n6 × 3 min at controlled 5K–10K effort / 2 min easy\n10 min cool-down",
            stimulus:
              "Raise aerobic power and 5K-specific speed while keeping every rep repeatable.",
          };
    }

    return recoveryWeek
      ? {
          title: "Reduced threshold builder",
          duration: 42,
          minimum: 30,
          intensity: "moderate" as const,
          prescription:
            "12 min warm-up\n2 × 8 min controlled threshold / 2 min easy\n10 min cool-down",
          stimulus:
            "Retain threshold frequency while reducing the dose after four full build weeks.",
        }
      : {
          title: "Threshold builder",
          duration: Math.round(52 * Math.min(1.08, progression)),
          minimum: 32,
          intensity: "hard" as const,
          prescription:
            "12 min warm-up\n3 × 8 min controlled threshold / 2 min easy\n10 min cool-down",
          stimulus:
            "Raise sustainable speed without turning the session into a race effort.",
        };
  }

  if (goal === "10k") {
    const intervalDay = role === "quality_alt";
    if (intervalDay) {
      return recoveryWeek
        ? {
            title: "Reduced 10K cruise intervals",
            duration: 48,
            minimum: 32,
            intensity: "moderate" as const,
            prescription:
              "12 min warm-up\n4 × 5 min around 10K effort / 90 sec easy\n10 min cool-down",
            stimulus: "Retain 10K rhythm with a smaller quality dose.",
          }
        : {
            title: "10K cruise intervals",
            duration: Math.round(55 * Math.min(1.08, progression)),
            minimum: 32,
            intensity: "hard" as const,
            prescription:
              "12 min warm-up\n5 × 5 min around 10K effort / 90 sec easy\n10 min cool-down",
            stimulus: "Build the ability to hold strong aerobic power for longer.",
          };
    }

    return recoveryWeek
      ? {
          title: "Reduced threshold progression",
          duration: 48,
          minimum: 32,
          intensity: "moderate" as const,
          prescription:
            "12 min warm-up\n2 × 10 min controlled threshold / 3 min easy\n10 min cool-down",
          stimulus: "Retain threshold frequency while reducing total work.",
        }
      : {
          title: "Threshold progression",
          duration: Math.round(55 * Math.min(1.08, progression)),
          minimum: 32,
          intensity: "hard" as const,
          prescription:
            "12 min warm-up\n2 × 15 min controlled threshold / 3 min easy\n10 min cool-down",
          stimulus: "Build the ability to hold strong aerobic power for longer.",
        };
  }

  const qualityByGoal = {
    half: {
      title: "Threshold endurance",
      duration: Math.round(60 * build),
      prescription: "15 min warm-up\n3 × 10 min threshold / 2 min easy\n10 min cool-down",
      stimulus:
        "Threshold durability that supports half-marathon pace without excessive anaerobic cost.",
    },
    spartan: {
      title: week % 2 === 0 ? "Hill power repeats" : "Compromised threshold",
      duration: Math.round(58 * build),
      prescription:
        week % 2 === 0
          ? "15 min easy\n8 × 2 min uphill strong / easy jog down\n10 min easy"
          : "12 min easy\n4 × 6 min strong rolling effort / 2 min easy\n10 min easy",
      stimulus:
        "Useful running power under terrain stress without sacrificing the rest of the hybrid week.",
    },
    hybrid: {
      title: "Hybrid-safe quality run",
      duration: Math.round(48 * build),
      prescription:
        "12 min warm-up\n5 × 4 min controlled hard / 2 min easy\n10 min cool-down",
      stimulus:
        "One protected running-quality stimulus that can coexist with strength and conditioning.",
    },
  }[goal];

  return {
    ...qualityByGoal,
    minimum: 30,
    intensity: recoveryWeek ? ("moderate" as const) : ("hard" as const),
  };
}

function chooseRoles(
  runDays: number[],
  requestedLongRunDay: number,
  goal: PlanStudioGoal,
) {
  const ordered = [...new Set(runDays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  const effectiveLongRunDay = ordered.includes(requestedLongRunDay)
    ? requestedLongRunDay
    : ordered[ordered.length - 1];
  const nonLong = ordered.filter((day) => day !== effectiveLongRunDay);
  const roles = new Map<number, PlannedRunRole>();

  if (effectiveLongRunDay != null) roles.set(effectiveLongRunDay, "long");
  if (nonLong[0] != null) roles.set(nonLong[0], "quality");
  nonLong.slice(1).forEach((day) => roles.set(day, "easy"));

  if ((goal === "5k" || goal === "10k") && nonLong.length >= 3) {
    roles.set(nonLong[nonLong.length - 1], "quality_alt");
  }

  return roles;
}

function isInsideRequestedDates(date: string, config: PlanStudioConfig) {
  if (date < config.startDate) return false;
  if (config.targetDate && date > config.targetDate) return false;
  return true;
}

export function buildPlanStudioSessions(config: PlanStudioConfig): PlanStudioSession[] {
  const monday = startOfMonday(config.startDate);
  const roles = chooseRoles(config.runDays, config.longRunDay, config.goal);
  const sessions: PlanStudioSession[] = [];

  for (let week = 1; week <= config.weeks; week += 1) {
    // Four uninterrupted build weeks first; week five is the earliest automatic
    // reduced-dose reassessment week. Readiness can still scale any individual day.
    const recoveryWeek = week > 4 && week % 5 === 0;

    for (const [day, role] of roles.entries()) {
      const shape = sessionForRole(config.goal, role, week, recoveryWeek);
      const date = dateKey(addDays(monday, (week - 1) * 7 + day));
      if (!isInsideRequestedDates(date, config)) continue;

      sessions.push({
        id: `studio-${config.goal}-${week}-${day}`,
        week,
        date,
        title: shape.title,
        type: config.goal === "spartan" && role === "long" ? "fell-trail" : "run",
        durationMinutes: Math.max(20, shape.duration),
        minimumMinutes: Math.min(
          Math.max(15, shape.minimum),
          Math.max(20, shape.duration),
        ),
        intensity: shape.intensity,
        prescription: shape.prescription,
        targetStimulus: `${shape.stimulus}${
          recoveryWeek
            ? " This is the first planned reduced-dose reassessment week after four full build weeks."
            : ""
        }`,
        role: role === "quality_alt" ? "quality" : role,
      });
    }

    for (const day of [...new Set(config.hawkeyeDays)].filter(
      (value) => Number.isInteger(value) && value >= 0 && value <= 6,
    )) {
      const date = dateKey(addDays(monday, (week - 1) * 7 + day));
      if (!isInsideRequestedDates(date, config)) continue;

      sessions.push({
        id: `studio-hawkeye-${week}-${day}`,
        week,
        date,
        title: "Hawkeye session",
        type: "crossfit",
        durationMinutes: 60,
        minimumMinutes: 40,
        intensity: "moderate",
        prescription:
          "Class session. Record the actual strength, conditioning and lower-body content after training.",
        targetStimulus:
          "Preserve hybrid strength and skill while TrainVault accounts for interference with running quality.",
        role: "hybrid",
      });
    }
  }

  return sessions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

function openTimeStep(
  phase: "warmup" | "work" | "recovery" | "cooldown",
  minutes: number,
  description: string,
): Extract<StructuredRunningElement, { kind: "step" }> {
  return {
    kind: "step",
    phase,
    duration: { type: "time", seconds: Math.max(60, Math.round(minutes * 60)) },
    target: { type: "open" },
    description,
  };
}

export function buildPlanStudioStructuredWorkout(
  sessionId: string,
  session: PlanStudioSession,
): StructuredRunningWorkout | null {
  if (
    session.type !== "run" &&
    session.type !== "fell-trail" &&
    session.type !== "race"
  ) {
    return null;
  }

  const qualityTemplates: Record<
    string,
    {
      warmup: number;
      reps: number;
      work: number;
      recovery: number | "open";
      cooldown: number;
      cue: string;
    }
  > = {
    "5K rhythm intervals": {
      warmup: 12,
      reps: 6,
      work: 3,
      recovery: 2,
      cooldown: 10,
      cue: "Controlled 5K–10K effort",
    },
    "Reduced 5K rhythm intervals": {
      warmup: 12,
      reps: 4,
      work: 3,
      recovery: 2,
      cooldown: 10,
      cue: "Controlled 5K–10K effort",
    },
    "Threshold builder": {
      warmup: 12,
      reps: 3,
      work: 8,
      recovery: 2,
      cooldown: 10,
      cue: "Controlled threshold",
    },
    "Reduced threshold builder": {
      warmup: 12,
      reps: 2,
      work: 8,
      recovery: 2,
      cooldown: 10,
      cue: "Controlled threshold",
    },
    "10K cruise intervals": {
      warmup: 12,
      reps: 5,
      work: 5,
      recovery: 1.5,
      cooldown: 10,
      cue: "Around 10K effort",
    },
    "Reduced 10K cruise intervals": {
      warmup: 12,
      reps: 4,
      work: 5,
      recovery: 1.5,
      cooldown: 10,
      cue: "Around 10K effort",
    },
    "Threshold progression": {
      warmup: 12,
      reps: 2,
      work: 15,
      recovery: 3,
      cooldown: 10,
      cue: "Controlled threshold",
    },
    "Reduced threshold progression": {
      warmup: 12,
      reps: 2,
      work: 10,
      recovery: 3,
      cooldown: 10,
      cue: "Controlled threshold",
    },
    "Threshold endurance": {
      warmup: 15,
      reps: 3,
      work: 10,
      recovery: 2,
      cooldown: 10,
      cue: "Threshold endurance",
    },
    "Hill power repeats": {
      warmup: 15,
      reps: 8,
      work: 2,
      recovery: "open",
      cooldown: 10,
      cue: "Uphill strong",
    },
    "Compromised threshold": {
      warmup: 12,
      reps: 4,
      work: 6,
      recovery: 2,
      cooldown: 10,
      cue: "Strong rolling effort",
    },
    "Hybrid-safe quality run": {
      warmup: 12,
      reps: 5,
      work: 4,
      recovery: 2,
      cooldown: 10,
      cue: "Controlled hard",
    },
  };

  const template = qualityTemplates[session.title];
  let steps: StructuredRunningElement[];

  if (template) {
    const recoveryStep: Extract<StructuredRunningElement, { kind: "step" }> =
      template.recovery === "open"
        ? {
            kind: "step",
            phase: "recovery",
            duration: { type: "open" },
            target: { type: "open" },
            description: "Easy jog down; press lap when ready",
          }
        : openTimeStep("recovery", template.recovery, "Easy recovery");

    steps = [
      openTimeStep("warmup", template.warmup, "Easy warm-up"),
      {
        kind: "repeat",
        repetitions: template.reps,
        steps: [
          openTimeStep("work", template.work, template.cue),
          recoveryStep,
        ],
      },
      openTimeStep("cooldown", template.cooldown, "Easy cool-down"),
    ];
  } else {
    const warmup =
      session.role === "long"
        ? 10
        : Math.min(10, Math.max(5, Math.round(session.durationMinutes * 0.2)));
    const cooldown =
      session.role === "long"
        ? 5
        : Math.min(10, Math.max(5, Math.round(session.durationMinutes * 0.15)));
    const work = Math.max(5, session.durationMinutes - warmup - cooldown);
    steps = [
      openTimeStep("warmup", warmup, "Relaxed warm-up"),
      openTimeStep(
        "work",
        work,
        session.role === "long"
          ? "Controlled aerobic endurance"
          : "Conversational aerobic running",
      ),
      openTimeStep("cooldown", cooldown, "Easy finish"),
    ];
  }

  return {
    id: sessionId,
    name: session.title.slice(0, 80),
    date: session.date,
    description: session.targetStimulus,
    estimatedDurationSeconds: Math.round(session.durationMinutes * 60),
    steps,
  };
}

export function planStudioGoalLabel(goal: PlanStudioGoal) {
  return {
    "5k": "Faster 5K",
    "10k": "Faster 10K",
    half: "Half marathon",
    spartan: "Spartan / mountain",
    hybrid: "Hybrid engine",
  }[goal];
}
