import type { Programme, ProgrammeDay, ProgrammeWeek, SessionLog, Workout } from "./types";

export type PlanGoal = "hybrid" | "5k" | "10k" | "spartan";

export type PlanBuilderConfig = {
  name: string;
  goal: PlanGoal;
  startDate: string;
  weeks: number;
  targetEvent?: string;
  targetDate?: string;
  current5k?: string;
  target5k?: string;
  crossFitSessions: 2 | 3;
  longRunStartMinutes?: number;
};

export type HistorySummary = {
  logs28d: number;
  sessionsPerWeek: number;
  runLogs28d: number;
  distance28dKm: number;
  averageWeeklyDistanceKm: number;
  longestRecentRunMinutes: number | null;
  suggestedLongRunMinutes: number;
  averageRpe: number | null;
};

const DAY_MS = 86_400_000;
const RUN_SIGNAL = /\b(run|running|track|5k|10k|mile|threshold|tempo|interval|trail|fell|road|treadmill|race)\b/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function isRunLog(log: SessionLog) {
  return log.workoutCategory === "track" || RUN_SIGNAL.test(`${log.workoutTitle} ${log.workoutSessionType ?? ""}`);
}

function parseClock(value?: string) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) return null;
  return minutes * 60 + seconds;
}

function formatPace(seconds: number) {
  const safe = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}/km`;
}

function paceGuidance(current5k?: string) {
  const seconds = parseClock(current5k);
  if (!seconds) {
    return {
      threshold: "RPE 7–8, controlled hard; finish knowing you could do one more rep",
      vo2: "RPE 8–9, 3–5 minute repeat effort; equal-quality reps",
      speed: "Fast and relaxed, full mechanics; never sprint the first rep",
    };
  }

  const pace5k = seconds / 5;
  return {
    threshold: `${formatPace(pace5k + 22)}–${formatPace(pace5k + 32)}`,
    vo2: `${formatPace(pace5k - 5)}–${formatPace(pace5k + 4)}`,
    speed: `${formatPace(pace5k - 12)}–${formatPace(pace5k - 4)} equivalent pace`,
  };
}

function phaseForWeek(index: number, totalWeeks: number) {
  const progress = (index + 1) / Math.max(totalWeeks, 1);
  if (progress <= 0.33) return "Base + economy";
  if (progress <= 0.7) return "Build + specificity";
  if (progress <= 0.88) return "Race-specific";
  return "Sharpen + absorb";
}

function workout(input: Partial<Workout> & Pick<Workout, "id" | "title" | "category" | "durationMinutes" | "intensity" | "focus" | "blocks">): Workout {
  return {
    equipment: [],
    ...input,
  };
}

function day(id: string, dayNumber: number, label: string, item: Workout): ProgrammeDay {
  return { id, dayNumber, label, workout: item };
}

function getThresholdSession(weekNumber: number, totalWeeks: number, pace: ReturnType<typeof paceGuidance>, id: string, date: string, phase: string) {
  const progress = weekNumber / Math.max(totalWeeks, 1);
  const prescription = progress < 0.25
    ? "3 × 8 min / 2 min easy jog"
    : progress < 0.55
      ? "4 × 8 min / 90 sec easy jog"
      : progress < 0.8
        ? "3 × 10 min / 2 min easy jog"
        : "2 × 10 min / 2 min easy jog";

  return workout({
    id,
    title: "Threshold Anchor",
    category: "track",
    durationMinutes: progress > 0.8 ? 50 : 60,
    intensity: "hard",
    sessionType: "threshold",
    phase,
    priority: "High",
    date,
    focus: ["threshold", "10K strength", "repeatability"],
    prescribedLoadsOrPace: `${prescription} · ${pace.threshold}`,
    targetStimulus: "Controlled hard running with stable reps. Do not turn rep one into a time trial.",
    blocks: [
      { name: "Warm-up", type: "warmup", durationMinutes: 12, items: ["Easy jog", "4 × 20 sec strides", "Mobility as needed"] },
      { name: "Threshold", type: "intervals", durationMinutes: 32, items: [prescription, pace.threshold] },
      { name: "Cool-down", type: "cooldown", durationMinutes: 10, items: ["Easy jog until breathing settles"] },
    ],
    coachNotes: "This is the weekly anchor. Protect it from heavy lower-body CrossFit the day before where possible.",
  });
}

function getRotatingQuality(weekNumber: number, totalWeeks: number, pace: ReturnType<typeof paceGuidance>, id: string, date: string, phase: string) {
  const rotation = (weekNumber - 1) % 4;
  const lateBlock = weekNumber / Math.max(totalWeeks, 1) > 0.78;

  if (rotation === 1) {
    return workout({
      id,
      title: "Hill Power",
      category: "track",
      durationMinutes: 50,
      intensity: "hard",
      sessionType: "hill-power",
      phase,
      priority: "High",
      date,
      focus: ["hill power", "Spartan climbing", "running form"],
      targetStimulus: "Powerful uphill mechanics without accumulating junk fatigue.",
      blocks: [
        { name: "Warm-up", type: "warmup", durationMinutes: 15, items: ["Easy run", "Drills", "3 × 15 sec progressive hill strides"] },
        { name: "Hill Repeats", type: "intervals", durationMinutes: 22, items: [lateBlock ? "8 × 60 sec uphill" : "6–8 × 60 sec uphill", "Jog/walk back fully controlled", "Tall posture, fast feet"] },
        { name: "Cool-down", type: "cooldown", durationMinutes: 10, items: ["Easy run", "Calves and hips easy mobility"] },
      ],
      coachNotes: "This replaces a flat interval day. It is not extra training added on top.",
    });
  }

  if (rotation === 2) {
    return workout({
      id,
      title: "Speed + Economy",
      category: "track",
      durationMinutes: 50,
      intensity: "hard",
      sessionType: "speed-economy",
      phase,
      priority: "High",
      date,
      focus: ["running economy", "5K speed", "mechanics"],
      prescribedLoadsOrPace: `10–12 × 400 m · ${pace.speed} · 60–75 sec easy recovery`,
      targetStimulus: "Quick, relaxed repetitions with no pace collapse.",
      blocks: [
        { name: "Warm-up", type: "warmup", durationMinutes: 14, items: ["Easy jog", "Drills", "4 × 20 sec strides"] },
        { name: "Fast Reps", type: "intervals", durationMinutes: 24, items: [lateBlock ? "8–10 × 400 m" : "10–12 × 400 m", pace.speed, "60–75 sec easy jog"] },
        { name: "Cool-down", type: "cooldown", durationMinutes: 10, items: ["Easy jog"] },
      ],
      coachNotes: "Fast enough to improve economy, controlled enough to coexist with CrossFit.",
    });
  }

  if (rotation === 3) {
    return workout({
      id,
      title: "Absorb + Benchmark",
      category: "track",
      durationMinutes: 45,
      intensity: "moderate",
      sessionType: "benchmark",
      phase,
      priority: "Medium",
      date,
      focus: ["absorb", "benchmark", "pace control"],
      prescribedLoadsOrPace: lateBlock ? "3K–5K controlled benchmark after full warm-up" : "20 min steady progression + 6 × 20 sec strides",
      targetStimulus: "Measure progress without turning every fourth week into another maximal interval session.",
      blocks: [
        { name: "Warm-up", type: "warmup", durationMinutes: 12, items: ["Easy jog", "Mobility", "Strides"] },
        { name: "Benchmark", type: "intervals", durationMinutes: 22, items: [lateBlock ? "Controlled 3K–5K benchmark" : "20 min progressive steady run", "Finish strong, not destroyed"] },
        { name: "Cool-down", type: "cooldown", durationMinutes: 8, items: ["Easy jog"] },
      ],
      coachNotes: "This is the pressure-release week in the quality rotation.",
    });
  }

  return workout({
    id,
    title: "VO₂ / Aerobic Power",
    category: "track",
    durationMinutes: 55,
    intensity: "hard",
    sessionType: "vo2",
    phase,
    priority: "High",
    date,
    focus: ["VO2", "5K power", "repeatability"],
    prescribedLoadsOrPace: `${lateBlock ? "5 × 3 min" : "5–6 × 3 min"} · ${pace.vo2} · 2 min easy jog`,
    targetStimulus: "Hard aerobic running with the final rep looking like the first.",
    blocks: [
      { name: "Warm-up", type: "warmup", durationMinutes: 14, items: ["Easy jog", "Drills", "4 × 20 sec strides"] },
      { name: "Aerobic Power", type: "intervals", durationMinutes: 26, items: [lateBlock ? "5 × 3 min" : "5–6 × 3 min", pace.vo2, "2 min easy jog"] },
      { name: "Cool-down", type: "cooldown", durationMinutes: 10, items: ["Easy jog"] },
    ],
    coachNotes: "The second quality slot rotates. Do not repeat this every week just because it is familiar.",
  });
}

function getLongRun(weekNumber: number, totalWeeks: number, startMinutes: number, goal: PlanGoal, id: string, date: string, phase: string) {
  const deload = weekNumber % 4 === 0;
  const cap = goal === "spartan" || goal === "hybrid" ? 150 : 110;
  const build = startMinutes + (weekNumber - 1) * 6;
  const duration = Math.round(clamp(deload ? build * 0.78 : build, 45, cap) / 5) * 5;
  const hilly = goal === "spartan" || goal === "hybrid" ? weekNumber % 2 === 0 : weekNumber % 3 === 0;
  const progressive = !deload && weekNumber / Math.max(totalWeeks, 1) > 0.55 && weekNumber % 3 === 0;

  return workout({
    id,
    title: hilly ? "Hilly / Fell Long Run" : progressive ? "Progressive Long Run" : "Easy Long Run",
    category: "track",
    durationMinutes: duration,
    intensity: progressive ? "moderate" : "easy",
    sessionType: hilly ? "long-fell" : "long-run",
    phase,
    priority: "High",
    date,
    focus: hilly ? ["aerobic durability", "hills", "downhill tolerance"] : ["aerobic durability", "easy volume"],
    prescribedLoadsOrPace: progressive ? `Easy for first ${Math.max(duration - 20, 25)} min, then controlled steady finish` : "Conversational effort; walk steep climbs if needed to keep the purpose aerobic",
    targetStimulus: hilly
      ? "Build mountain legs and technical durability without racing the whole route."
      : "Accumulate durable aerobic work that does not sabotage the following week.",
    blocks: [
      { name: "Long Run", type: "conditioning", durationMinutes: duration, items: [hilly ? "Choose rolling trail/fell terrain" : "Easy continuous running", progressive ? "Last 20 min steady if legs are good" : "Keep it conversational"] },
    ],
    coachNotes: deload ? "Reduced long-run week. Let the previous three weeks land." : hilly ? "Practise descents gradually; downhill soreness is training load too." : "Duration grows gradually. No bonus miles required.",
  });
}

function getCrossFitSession(slot: 1 | 2 | 3, id: string, date: string, phase: string): Workout {
  const titles = {
    1: "CrossFit · Strength + Skill",
    2: "CrossFit · Upper / Skill Bias",
    3: "CrossFit · Mixed Conditioning",
  } as const;
  const notes = {
    1: "Avoid lower-body failure or huge eccentric volume before the threshold anchor.",
    2: "Best home for gymnastics, upper-body strength and skill work between the two key runs.",
    3: "Keep leg volume sensible if the weekend long run is important. Heavy sleds, thrusters and lunges all count.",
  } as const;

  return workout({
    id,
    title: titles[slot],
    category: slot === 1 ? "strength" : "hybrid",
    durationMinutes: 60,
    intensity: slot === 2 ? "moderate" : "hard",
    sessionType: "crossfit",
    phase,
    priority: slot === 2 ? "Medium" : "High",
    date,
    focus: slot === 1 ? ["strength", "skill", "CrossFit"] : slot === 2 ? ["gymnastics", "upper body", "skill"] : ["conditioning", "CrossFit", "race resilience"],
    targetStimulus: "Follow the gym programming, but preserve the week's key running outcomes.",
    blocks: [
      { name: "Gym Programming", type: slot === 1 ? "strength" : "conditioning", durationMinutes: 60, items: ["Use current CrossFit / Hawkeye session", notes[slot]] },
    ],
    coachNotes: notes[slot],
  });
}

function getRaceSession(config: PlanBuilderConfig, id: string, date: string, phase: string): Workout {
  return workout({
    id,
    title: config.targetEvent ? `Race · ${config.targetEvent}` : "Race / Benchmark",
    category: "hybrid",
    durationMinutes: config.goal === "spartan" || config.goal === "hybrid" ? 150 : 60,
    intensity: "hard",
    sessionType: "race",
    phase,
    priority: "Target",
    date,
    focus: ["race", config.goal, "execution"],
    targetStimulus: "This is the week's main quality and long-duration stimulus. Do not stack normal hard work around it.",
    blocks: [
      { name: "Race", type: "conditioning", items: [config.targetEvent ?? "Target event", "Execute pacing and fuelling plan"] },
    ],
    coachNotes: "Race week changes the rules: reduce normal quality and CrossFit leg volume rather than trying to tick every usual box.",
  });
}

export function inferTrainingHistory(logs: SessionLog[], now = Date.now()): HistorySummary {
  const cutoff = now - 28 * DAY_MS;
  const recent = logs.filter((log) => new Date(log.completedAt).getTime() >= cutoff);
  const runLogs = recent.filter(isRunLog);
  const distance28dKm = runLogs.reduce((total, log) => total + (log.distanceKm ?? 0), 0);
  const longestRecentRunMinutes = runLogs.reduce<number | null>((longest, log) => {
    const duration = log.actualDurationMinutes;
    if (!duration) return longest;
    return longest === null ? duration : Math.max(longest, duration);
  }, null);
  const suggestedLongRunMinutes = Math.round(clamp(longestRecentRunMinutes ?? 60, 50, 105) / 5) * 5;

  return {
    logs28d: recent.length,
    sessionsPerWeek: recent.length / 4,
    runLogs28d: runLogs.length,
    distance28dKm,
    averageWeeklyDistanceKm: distance28dKm / 4,
    longestRecentRunMinutes,
    suggestedLongRunMinutes,
    averageRpe: recent.length > 0 ? recent.reduce((total, log) => total + log.rpe, 0) / recent.length : null,
  };
}

export function buildAgogeProgramme(config: PlanBuilderConfig, logs: SessionLog[]): Programme {
  const history = inferTrainingHistory(logs);
  const startLong = clamp(config.longRunStartMinutes ?? history.suggestedLongRunMinutes, 45, 120);
  const pace = paceGuidance(config.current5k);
  const token = Date.now().toString(36);
  const weeks: ProgrammeWeek[] = [];

  for (let weekIndex = 0; weekIndex < config.weeks; weekIndex += 1) {
    const weekNumber = weekIndex + 1;
    const phase = phaseForWeek(weekIndex, config.weeks);
    const weekStart = addDays(config.startDate, weekIndex * 7);
    const weekEnd = addDays(weekStart, 6);
    const raceInWeek = Boolean(config.targetDate && config.targetDate >= weekStart && config.targetDate <= weekEnd);
    const baseId = `agoge-${token}-w${weekNumber}`;
    const days: ProgrammeDay[] = [];

    days.push(day(`${baseId}-d1`, 1, "Monday", getCrossFitSession(1, `${baseId}-cf1`, addDays(weekStart, 0), phase)));

    if (raceInWeek) {
      const threshold = getThresholdSession(weekNumber, config.weeks, pace, `${baseId}-threshold`, addDays(weekStart, 1), phase);
      threshold.durationMinutes = 40;
      threshold.prescribedLoadsOrPace = `2 × 8 min controlled · ${pace.threshold}`;
      threshold.coachNotes = "Race-week maintenance only. Finish fresher than you started.";
      days.push(day(`${baseId}-d2`, 2, "Tuesday", threshold));
      days.push(day(`${baseId}-d3`, 3, "Wednesday", getCrossFitSession(2, `${baseId}-cf2`, addDays(weekStart, 2), phase)));
      days.push(day(`${baseId}-d4`, 4, "Thursday", workout({
        id: `${baseId}-primer`,
        title: "Race Primer",
        category: "track",
        durationMinutes: 35,
        intensity: "moderate",
        sessionType: "primer",
        phase,
        priority: "Primer",
        date: addDays(weekStart, 3),
        focus: ["race pace", "strides", "freshness"],
        prescribedLoadsOrPace: "Easy running + 4–6 × 20 sec quick strides",
        targetStimulus: "Wake the legs up; create zero soreness.",
        blocks: [
          { name: "Primer", type: "intervals", durationMinutes: 35, items: ["20–25 min easy", "4–6 × 20 sec strides", "Full easy recovery"] },
        ],
      })));
      const raceDate = config.targetDate ?? addDays(weekStart, 6);
      const raceDayNumber = clamp(Math.floor((new Date(`${raceDate}T12:00:00`).getTime() - new Date(`${weekStart}T12:00:00`).getTime()) / DAY_MS) + 1, 1, 7);
      days.push(day(`${baseId}-race-day`, raceDayNumber, "Race day", getRaceSession(config, `${baseId}-race`, raceDate, phase)));
    } else {
      days.push(day(`${baseId}-d2`, 2, "Tuesday", getThresholdSession(weekNumber, config.weeks, pace, `${baseId}-threshold`, addDays(weekStart, 1), phase)));
      days.push(day(`${baseId}-d3`, 3, "Wednesday", getCrossFitSession(2, `${baseId}-cf2`, addDays(weekStart, 2), phase)));
      days.push(day(`${baseId}-d4`, 4, "Thursday", getRotatingQuality(weekNumber, config.weeks, pace, `${baseId}-quality`, addDays(weekStart, 3), phase)));
      if (config.crossFitSessions === 3) {
        days.push(day(`${baseId}-d5`, 5, "Friday", getCrossFitSession(3, `${baseId}-cf3`, addDays(weekStart, 4), phase)));
      }
      days.push(day(`${baseId}-d7`, 7, "Sunday", getLongRun(weekNumber, config.weeks, startLong, config.goal, `${baseId}-long`, addDays(weekStart, 6), phase)));
    }

    weeks.push({
      id: `${baseId}-week`,
      weekNumber,
      title: raceInWeek ? `Race week · ${config.targetEvent ?? "target event"}` : `${phase} · Week ${weekNumber}`,
      days: days.sort((a, b) => a.dayNumber - b.dayNumber),
    });
  }

  const target5k = config.target5k?.trim();
  const goalCopy = config.goal === "spartan"
    ? "Spartan-specific running durability, hill power and CrossFit integration"
    : config.goal === "5k"
      ? "5K speed and threshold development while retaining CrossFit"
      : config.goal === "10k"
        ? "10K threshold strength with a faster 5K engine"
        : "Hybrid 5K/10K speed plus Spartan/fell durability around CrossFit";

  return {
    id: `agoge-generated-${token}`,
    name: config.name.trim() || "Agoge Hybrid Build",
    description: `${goalCopy}.${target5k ? ` Target 5K: ${target5k}.` : ""} Generated natively from The Agoge; existing training history was used to set the starting long-run load where available.`,
    durationWeeks: config.weeks,
    startDate: config.startDate,
    targetEvent: config.targetEvent?.trim() || undefined,
    targetDate: config.targetDate || undefined,
    trainingSettings: {
      runsPerWeek: 3,
      crossFitSessionsPerWeek: config.crossFitSessions,
      startingLongRunMinutes: startLong,
      historyLogs28d: history.logs28d,
      historyAverageWeeklyDistanceKm: Math.round(history.averageWeeklyDistanceKm * 10) / 10,
    },
    weeks,
  };
}
