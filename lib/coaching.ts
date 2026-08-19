import { normalizeLimiter } from "./session-log";
import type { Programme, ProgrammeWeek, SessionLog, Workout } from "./types";

export type CoachingTone = "blue" | "red" | "amber" | "green" | "purple";

export type CoachingInsight = {
  id: string;
  title: string;
  summary: string;
  action: string;
  tone: CoachingTone;
  confidence: "high" | "medium" | "low";
};

export type PlanAudit = {
  score: number;
  week: ProgrammeWeek | null;
  runSessions: number;
  qualityRuns: number;
  easyRuns: number;
  longRuns: number;
  hillSessions: number;
  crossFitSessions: number;
  hardSessions: number;
  hardDayClashes: number;
  lowerBodyRunClashes: number;
  genericRunPattern: boolean;
  raceWeek: boolean;
  strengths: string[];
  gaps: string[];
};

export type TrainingMetrics = {
  readiness: number;
  readinessLabel: string;
  readinessDetail: string;
  load7d: number;
  chronicWeeklyLoad: number;
  loadRatio: number | null;
  sessions7d: number;
  hardSessions7d: number;
  averageRpe7d: number | null;
  distance7dKm: number;
  elevation7dM: number;
  distance28dKm: number;
  elevation28dM: number;
  topLimiter: string | null;
  topLimiterCount: number;
  runLogsWithMetrics: number;
};

export type WeeklyTrendPoint = {
  label: string;
  distanceKm: number;
  elevationM: number;
  load: number;
  sessions: number;
  averageRpe: number | null;
};

const RUN_SIGNAL = /\b(run|running|track|5k|10k|mile|threshold|tempo|interval|strides?|fartlek|trail|fell|road|treadmill)\b/i;
const HILL_SIGNAL = /\b(hill|hilly|fell|trail|climb|climbing|vert|vertical|elevation|downhill|uphill|mountain)\b/i;
const LONG_SIGNAL = /\b(long run|long aerobic|endurance run|long trail|long fell)\b/i;
const THRESHOLD_SIGNAL = /\b(threshold|tempo|cruise interval|10k effort)\b/i;
const INTERVAL_SIGNAL = /\b(interval|vo2|400m|800m|1k|mile repeat|speed endurance|aerobic power)\b/i;
const EASY_SIGNAL = /\b(easy|recovery|zone 2|z2|conversational|aerobic base|reload)\b/i;
const LEG_SIGNAL = /\b(squat|deadlift|lunge|sled|thruster|clean|snatch|lower body|legs|step-up|step up|wall ball)\b/i;
const OCR_SIGNAL = /\b(spartan|ocr|trifecta|sprint|super|beast|obstacle|carry|rope|rig|sandbag)\b/i;
const RACE_SIGNAL = /\b(race|spartan|trifecta|sprint|super|beast|competition|event)\b/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function workoutText(workout: Workout) {
  const blockText = workout.blocks.flatMap((block) => [block.name, ...block.items]).join(" ");
  return [
    workout.title,
    workout.category,
    workout.sessionType,
    workout.phase,
    workout.priority,
    workout.prescribedLoadsOrPace,
    workout.targetStimulus,
    workout.coachNotes,
    ...workout.focus,
    ...workout.equipment,
    blockText,
  ]
    .filter(Boolean)
    .join(" ");
}

export function isRunWorkout(workout: Workout) {
  return workout.category === "track" || RUN_SIGNAL.test(workoutText(workout));
}

export function isHillWorkout(workout: Workout) {
  return isRunWorkout(workout) && HILL_SIGNAL.test(workoutText(workout));
}

export function isLongRun(workout: Workout) {
  const text = workoutText(workout);
  return isRunWorkout(workout) && (LONG_SIGNAL.test(text) || (workout.durationMinutes >= 75 && EASY_SIGNAL.test(text)));
}

export function isThresholdWorkout(workout: Workout) {
  return isRunWorkout(workout) && THRESHOLD_SIGNAL.test(workoutText(workout));
}

export function isIntervalWorkout(workout: Workout) {
  return isRunWorkout(workout) && INTERVAL_SIGNAL.test(workoutText(workout));
}

export function isEasyRun(workout: Workout) {
  return isRunWorkout(workout) && (workout.intensity === "easy" || EASY_SIGNAL.test(workoutText(workout)));
}

export function isCrossFitStyleWorkout(workout: Workout) {
  if (isRunWorkout(workout)) {
    return workout.category === "hybrid" || OCR_SIGNAL.test(workoutText(workout));
  }

  return ["strength", "conditioning", "gymnastics", "hybrid"].includes(workout.category);
}

function isLegHeavy(workout: Workout) {
  return LEG_SIGNAL.test(workoutText(workout));
}

function isHardWorkout(workout: Workout) {
  return (
    workout.intensity === "hard" ||
    workout.priority === "High" ||
    workout.priority === "Target" ||
    workout.priority === "Primer" ||
    isThresholdWorkout(workout) ||
    isIntervalWorkout(workout)
  );
}

function isRaceWorkout(workout: Workout) {
  return RACE_SIGNAL.test(workoutText(workout));
}

function getWorkoutMap(programme: Programme | null | undefined) {
  const map = new Map<string, Workout>();

  programme?.weeks.forEach((week) => {
    week.days.forEach((day) => map.set(day.workout.id, day.workout));
  });

  return map;
}

function completedAtMs(log: SessionLog) {
  return new Date(log.completedAt).getTime();
}

function sessionLoad(log: SessionLog, workout?: Workout) {
  const minutes = log.actualDurationMinutes ?? workout?.durationMinutes ?? 45;
  return Math.round(minutes * clamp(log.rpe, 1, 10));
}

function startOfLocalDay(value: number) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getWeekIndexFromStart(programme: Programme, now: number) {
  if (!programme.startDate || !now) {
    return null;
  }

  const start = new Date(`${programme.startDate}T00:00:00`).getTime();
  const today = startOfLocalDay(now);
  const diffDays = Math.floor((today - start) / 86_400_000);

  if (diffDays < 0) {
    return 0;
  }

  return clamp(Math.floor(diffDays / 7), 0, Math.max(programme.weeks.length - 1, 0));
}

export function getCurrentProgrammeWeek(programme: Programme, logs: SessionLog[], now: number) {
  if (programme.weeks.length === 0) {
    return null;
  }

  const datedIndex = getWeekIndexFromStart(programme, now);

  if (datedIndex !== null) {
    return programme.weeks[datedIndex] ?? programme.weeks[0] ?? null;
  }

  const completed = new Set(logs.map((log) => log.workoutId));
  return (
    programme.weeks.find((week) => week.days.some((day) => !completed.has(day.workout.id))) ??
    programme.weeks.at(-1) ??
    null
  );
}

export function buildTrainingMetrics(programme: Programme | null | undefined, logs: SessionLog[], now: number): TrainingMetrics {
  const workoutMap = getWorkoutMap(programme);
  const nowMs = now || Date.now();
  const cutoff7 = nowMs - 7 * 86_400_000;
  const cutoff28 = nowMs - 28 * 86_400_000;
  const logs7 = logs.filter((log) => completedAtMs(log) >= cutoff7);
  const logs28 = logs.filter((log) => completedAtMs(log) >= cutoff28);
  const load7d = logs7.reduce((total, log) => total + sessionLoad(log, workoutMap.get(log.workoutId)), 0);
  const load28 = logs28.reduce((total, log) => total + sessionLoad(log, workoutMap.get(log.workoutId)), 0);
  const chronicWeeklyLoad = Math.round(load28 / 4);
  const loadRatio = chronicWeeklyLoad > 0 ? load7d / chronicWeeklyLoad : null;
  const averageRpe7d = logs7.length > 0 ? logs7.reduce((total, log) => total + log.rpe, 0) / logs7.length : null;
  const hardSessions7d = logs7.filter((log) => log.rpe >= 8).length;
  const distance7dKm = logs7.reduce((total, log) => total + (log.distanceKm ?? 0), 0);
  const elevation7dM = logs7.reduce((total, log) => total + (log.elevationM ?? 0), 0);
  const distance28dKm = logs28.reduce((total, log) => total + (log.distanceKm ?? 0), 0);
  const elevation28dM = logs28.reduce((total, log) => total + (log.elevationM ?? 0), 0);
  const runLogsWithMetrics = logs28.filter((log) => {
    const workout = workoutMap.get(log.workoutId);
    return Boolean(workout && isRunWorkout(workout) && (log.distanceKm || log.averagePaceSecondsPerKm || log.elevationM));
  }).length;

  const limiterCounts = new Map<string, number>();
  logs28.forEach((log) => {
    const limiter = normalizeLimiter(log.limiter);
    if (limiter) limiterCounts.set(limiter, (limiterCounts.get(limiter) ?? 0) + 1);
  });
  const [topLimiter, topLimiterCount] = [...limiterCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

  let readiness = logs.length === 0 ? 70 : 84;

  if (loadRatio !== null) {
    if (loadRatio >= 1.55) readiness -= 24;
    else if (loadRatio >= 1.35) readiness -= 16;
    else if (loadRatio >= 1.2) readiness -= 8;
    else if (loadRatio >= 0.75 && loadRatio <= 1.15) readiness += 3;
    else if (loadRatio < 0.55) readiness -= 4;
  }

  if (hardSessions7d >= 4) readiness -= 12;
  else if (hardSessions7d === 3) readiness -= 6;
  if (averageRpe7d !== null && averageRpe7d >= 8.5) readiness -= 8;
  else if (averageRpe7d !== null && averageRpe7d <= 6.5 && logs7.length >= 2) readiness += 3;

  const lastLogMs = logs.length > 0 ? Math.max(...logs.map(completedAtMs)) : 0;
  const hoursSinceLast = lastLogMs ? (nowMs - lastLogMs) / 3_600_000 : null;
  if (hoursSinceLast !== null && hoursSinceLast >= 36 && hoursSinceLast <= 96) readiness += 4;

  readiness = Math.round(clamp(readiness, 35, 96));
  const readinessLabel = readiness >= 82 ? "Ready to build" : readiness >= 68 ? "Train with control" : readiness >= 55 ? "Protect quality" : "Recovery priority";
  const readinessDetail = logs.length === 0
    ? "Baseline only — log sessions to calibrate workload and fatigue."
    : loadRatio === null
      ? "Not enough 28-day history for a stable workload ratio yet."
      : `7-day load is ${loadRatio.toFixed(2)}× your rolling weekly baseline; ${hardSessions7d} hard session${hardSessions7d === 1 ? "" : "s"} logged in the last 7 days.`;

  return {
    readiness,
    readinessLabel,
    readinessDetail,
    load7d,
    chronicWeeklyLoad,
    loadRatio,
    sessions7d: logs7.length,
    hardSessions7d,
    averageRpe7d,
    distance7dKm,
    elevation7dM,
    distance28dKm,
    elevation28dM,
    topLimiter,
    topLimiterCount,
    runLogsWithMetrics,
  };
}

export function auditCurrentPlan(programme: Programme | null | undefined, logs: SessionLog[], now: number): PlanAudit {
  const week = programme ? getCurrentProgrammeWeek(programme, logs, now) : null;

  if (!week) {
    return {
      score: 0,
      week: null,
      runSessions: 0,
      qualityRuns: 0,
      easyRuns: 0,
      longRuns: 0,
      hillSessions: 0,
      crossFitSessions: 0,
      hardSessions: 0,
      hardDayClashes: 0,
      lowerBodyRunClashes: 0,
      genericRunPattern: false,
      raceWeek: false,
      strengths: [],
      gaps: ["No active training week to audit."],
    };
  }

  const days = [...week.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const runSessions = days.filter((day) => isRunWorkout(day.workout)).length;
  const qualityRuns = days.filter((day) => isThresholdWorkout(day.workout) || isIntervalWorkout(day.workout)).length;
  const easyRuns = days.filter((day) => isEasyRun(day.workout)).length;
  const longRuns = days.filter((day) => isLongRun(day.workout)).length;
  const hillSessions = days.filter((day) => isHillWorkout(day.workout)).length;
  const crossFitSessions = days.filter((day) => isCrossFitStyleWorkout(day.workout)).length;
  const hardSessions = days.filter((day) => isHardWorkout(day.workout)).length;
  const raceWeek = days.some((day) => isRaceWorkout(day.workout));

  let hardDayClashes = 0;
  let lowerBodyRunClashes = 0;

  for (let index = 0; index < days.length - 1; index += 1) {
    const current = days[index];
    const next = days[index + 1];
    const gap = next.dayNumber - current.dayNumber;

    if (gap <= 1 && isHardWorkout(current.workout) && isHardWorkout(next.workout)) {
      hardDayClashes += 1;
    }

    if (
      gap <= 1 &&
      ((isLegHeavy(current.workout) && (isThresholdWorkout(next.workout) || isIntervalWorkout(next.workout) || isLongRun(next.workout))) ||
        (isLegHeavy(next.workout) && (isThresholdWorkout(current.workout) || isIntervalWorkout(current.workout) || isLongRun(current.workout))))
    ) {
      lowerBodyRunClashes += 1;
    }
  }

  const hasThreshold = days.some((day) => isThresholdWorkout(day.workout));
  const hasIntervals = days.some((day) => isIntervalWorkout(day.workout));
  const genericRunPattern = runSessions >= 3 && hasThreshold && hasIntervals && longRuns > 0 && hillSessions === 0;
  const strengths: string[] = [];
  const gaps: string[] = [];
  let score = 100;

  if (raceWeek) {
    strengths.push("Race week detected — races can replace conventional quality and long-run stimuli.");
  }

  if (runSessions >= 3) strengths.push(`${runSessions} run-focused sessions provide enough frequency to develop the engine.`);
  else if (!raceWeek) {
    score -= 12;
    gaps.push("Running frequency is below three sessions; progression may be limited if sub-20 5K / OCR speed is the goal.");
  }

  if (qualityRuns >= 1 && qualityRuns <= 2) strengths.push("Quality running is present without automatically turning every run into a hard day.");
  if (qualityRuns >= 3 && !raceWeek) {
    score -= 15;
    gaps.push("Three or more quality runs are competing with CrossFit load. Protect two key run sessions and make the rest truly easy or technical.");
  }

  if (longRuns > 0 || raceWeek) strengths.push(longRuns > 0 ? "A long aerobic exposure is present." : "Race volume supplies the long aerobic exposure this week.");
  else {
    score -= 10;
    gaps.push("No long aerobic exposure is present this week.");
  }

  if (hillSessions > 0) strengths.push("Hill/fell specificity is built into the week rather than bolted on as extra fatigue.");
  else if (!raceWeek) {
    score -= 8;
    gaps.push("No hill/fell stimulus is visible. For Spartan, hills need to become a recurring skill, not a spring panic button.");
  }

  if (easyRuns > 0) strengths.push("An easy running slot supports mileage, durability and recovery between quality sessions.");
  else if (!raceWeek) {
    score -= 8;
    gaps.push("No clearly easy run is visible; the plan risks becoming three flavours of hard running on top of CrossFit.");
  }

  if (hardDayClashes > 0 && !raceWeek) {
    score -= hardDayClashes * 7;
    gaps.push(`${hardDayClashes} back-to-back hard-day clash${hardDayClashes === 1 ? "" : "es"} detected. Separate key stimuli where possible.`);
  }

  if (lowerBodyRunClashes > 0 && !raceWeek) {
    score -= lowerBodyRunClashes * 8;
    gaps.push(`${lowerBodyRunClashes} lower-body / key-run interference clash${lowerBodyRunClashes === 1 ? "" : "es"} detected.`);
  }

  if (genericRunPattern && !raceWeek) {
    score -= 8;
    gaps.push("The running layer is structurally sound but generic: threshold + intervals + long run with no hill or economy rotation.");
  }

  return {
    score: Math.round(clamp(score, 25, 100)),
    week,
    runSessions,
    qualityRuns,
    easyRuns,
    longRuns,
    hillSessions,
    crossFitSessions,
    hardSessions,
    hardDayClashes,
    lowerBodyRunClashes,
    genericRunPattern,
    raceWeek,
    strengths,
    gaps,
  };
}

export function buildCoachingInsights(programme: Programme | null | undefined, logs: SessionLog[], now: number): CoachingInsight[] {
  const metrics = buildTrainingMetrics(programme, logs, now);
  const audit = auditCurrentPlan(programme, logs, now);
  const insights: CoachingInsight[] = [];

  if (metrics.loadRatio !== null && metrics.loadRatio >= 1.35) {
    insights.push({
      id: "load-high",
      title: "Protect the adaptation",
      summary: `Your 7-day session-RPE load is ${metrics.loadRatio.toFixed(2)}× the rolling weekly baseline.`,
      action: "Keep the next quality session, but trim accessory volume or make the following day genuinely easy. Do not add mileage just because the diary has space.",
      tone: "red",
      confidence: "high",
    });
  } else if (metrics.loadRatio !== null && metrics.loadRatio >= 0.8 && metrics.loadRatio <= 1.2) {
    insights.push({
      id: "load-stable",
      title: "Load is in a productive band",
      summary: `Seven-day load is ${metrics.loadRatio.toFixed(2)}× baseline with ${metrics.hardSessions7d} hard session${metrics.hardSessions7d === 1 ? "" : "s"} logged.`,
      action: "Progress one thing at a time this week: pace, volume or elevation. Do not chase all three in the same seven days.",
      tone: "green",
      confidence: "high",
    });
  } else {
    insights.push({
      id: "load-calibration",
      title: "Build the load baseline",
      summary: metrics.sessions7d > 0 ? "Training is being logged, but the 28-day baseline is still settling." : "There is not enough recent training data to call fatigue confidently yet.",
      action: "Keep logging duration and RPE. Four consistent weeks turns this from a guess into a useful fatigue signal.",
      tone: "blue",
      confidence: "medium",
    });
  }

  if (audit.genericRunPattern) {
    insights.push({
      id: "run-architecture",
      title: "Stop repeating the same three-run template",
      summary: "Threshold + intervals + long run is a decent skeleton, but it is too generic for a sub-20 5K plus Spartan podium build.",
      action: "Keep threshold as the anchor. Rotate the second quality slot between VO₂ reps, short speed/economy and hill power. Rotate long runs between easy, hilly/fell and progressive finishes instead of making every week identical.",
      tone: "blue",
      confidence: "high",
    });
  } else if (audit.hillSessions === 0 && !audit.raceWeek) {
    insights.push({
      id: "hill-gap",
      title: "Hill durability is the missing layer",
      summary: "This week has no obvious uphill/downhill or fell stimulus.",
      action: "Replace — rather than add to — one interval slot with 6–10 × 45–75 sec uphill, or make the long run hilly. Build downhill tolerance gradually while legs are fresh enough to learn it.",
      tone: "amber",
      confidence: "high",
    });
  } else if (audit.hillSessions > 0) {
    insights.push({
      id: "hill-present",
      title: "Hill specificity is being banked",
      summary: `${audit.hillSessions} hill/fell-focused exposure${audit.hillSessions === 1 ? " is" : "s are"} visible in the current week.`,
      action: "Keep one hill purpose per session: power, sustained climbing or technical descending. Avoid turning every hilly run into a race.",
      tone: "blue",
      confidence: "high",
    });
  }

  if (audit.lowerBodyRunClashes > 0 || audit.hardDayClashes > 0) {
    insights.push({
      id: "interference",
      title: "CrossFit is stealing from run quality",
      summary: `${audit.lowerBodyRunClashes} lower-body/key-run clash${audit.lowerBodyRunClashes === 1 ? "" : "es"} and ${audit.hardDayClashes} back-to-back hard-day clash${audit.hardDayClashes === 1 ? "" : "es"} are visible.`,
      action: "Put heavy squats, sleds, thrusters and high-rep leg work at least 24 hours away from the most important run where shifts allow. Upper-body or skill-biased CrossFit is the safer neighbour.",
      tone: "red",
      confidence: "high",
    });
  } else if (audit.crossFitSessions > 0) {
    insights.push({
      id: "interference-good",
      title: "CrossFit and running are coexisting well",
      summary: "No obvious lower-body collision with a key run is visible in the current week.",
      action: "Keep protecting the key run days. CrossFit stays an asset when it builds strength and skill without flattening the sessions that move running pace.",
      tone: "green",
      confidence: "medium",
    });
  }

  if (metrics.topLimiter && metrics.topLimiterCount >= 2) {
    insights.push({
      id: "limiter",
      title: `Recurring limiter: ${metrics.topLimiter}`,
      summary: `${metrics.topLimiter} has been logged ${metrics.topLimiterCount} times in the last 28 days.`,
      action: metrics.topLimiter === "pacing"
        ? "Open the next quality session one notch calmer and aim for a negative split. Repeatability beats one heroic first rep."
        : metrics.topLimiter === "legs"
          ? "Check lower-body CrossFit placement first, then add eccentric calf/quad/hamstring work rather than simply more hard running."
          : metrics.topLimiter === "grip"
            ? "Use short, high-quality grip exposures 2–3 times per week and practise obstacle work while breathing hard, not only when fresh."
            : `Give ${metrics.topLimiter} one small targeted exposure twice this week, then reassess rather than adding a whole extra session.`,
      tone: "purple",
      confidence: "high",
    });
  }

  if (metrics.runLogsWithMetrics < 2) {
    insights.push({
      id: "run-data",
      title: "Unlock better run coaching",
      summary: "Pace, distance and elevation are not yet structured enough for credible 5K or Spartan race predictions.",
      action: "For run sessions, log distance, average pace and elevation. Once there are a few weeks of that data, the app can distinguish faster fitness from simply harder effort.",
      tone: "amber",
      confidence: "high",
    });
  } else {
    insights.push({
      id: "run-data-good",
      title: "Run data is becoming coachable",
      summary: `${metrics.runLogsWithMetrics} run sessions in the last 28 days include structured pace, distance or elevation data.`,
      action: "Keep the fields consistent. The next useful signal is whether similar RPE produces faster pace or more elevation over time.",
      tone: "purple",
      confidence: "medium",
    });
  }

  if (audit.raceWeek) {
    insights.unshift({
      id: "race-week",
      title: "Race week changes the rules",
      summary: "A race / Spartan stimulus is present in the current week, so conventional weekly targets should not be stacked on top of it.",
      action: "Treat the race as the quality and long-duration stimulus. Remove one normal hard run, keep only short maintenance work, and spend the recovery budget on arriving sharp.",
      tone: "red",
      confidence: "high",
    });
  }

  return insights.slice(0, 7);
}

export function buildWeeklyTrend(programme: Programme | null | undefined, logs: SessionLog[], now: number, weeks = 4): WeeklyTrendPoint[] {
  const workoutMap = getWorkoutMap(programme);
  const nowDate = new Date(now || Date.now());
  nowDate.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(nowDate);
  const day = currentWeekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  currentWeekStart.setDate(currentWeekStart.getDate() + mondayOffset);

  return Array.from({ length: weeks }, (_, index) => {
    const offset = weeks - 1 - index;
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const weekLogs = logs.filter((log) => {
      const value = completedAtMs(log);
      return value >= startMs && value < endMs;
    });
    const load = weekLogs.reduce((total, log) => total + sessionLoad(log, workoutMap.get(log.workoutId)), 0);
    const averageRpe = weekLogs.length > 0 ? weekLogs.reduce((total, log) => total + log.rpe, 0) / weekLogs.length : null;

    return {
      label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(start),
      distanceKm: weekLogs.reduce((total, log) => total + (log.distanceKm ?? 0), 0),
      elevationM: weekLogs.reduce((total, log) => total + (log.elevationM ?? 0), 0),
      load,
      sessions: weekLogs.length,
      averageRpe,
    };
  });
}

export function getGoalCopy(programme: Programme | null | undefined) {
  const target = `${programme?.targetEvent ?? ""} ${programme?.description ?? ""}`.toLowerCase();
  const hasOcrGoal = OCR_SIGNAL.test(target) || programme?.weeks.some((week) => week.days.some((day) => OCR_SIGNAL.test(workoutText(day.workout))));

  return {
    primary: hasOcrGoal ? "Spartan AG podium" : programme?.targetEvent ?? "Primary performance goal",
    secondary: "Sub-20 5K engine",
    tertiary: "Fell-running durability",
  };
}
