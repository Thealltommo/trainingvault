import { clamp, makeStableId, round } from "./ids";
import type {
  ConservativeRunPlan,
  ConservativeRunPlanInput,
  ConservativeRunPlanWeek,
  PlannedRunSession,
  RunSessionFamily,
} from "./types";

function average(values: number[] | undefined) {
  const valid = (values ?? []).filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  return valid.length > 0
    ? valid.reduce((total, value) => total + value, 0) / valid.length
    : undefined;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(first: string, second: string) {
  const firstTime = new Date(`${first}T00:00:00Z`).getTime();
  const secondTime = new Date(`${second}T00:00:00Z`).getTime();
  return Number.isFinite(firstTime) && Number.isFinite(secondTime)
    ? Math.floor((secondTime - firstTime) / 86_400_000)
    : Number.NaN;
}

function circularDistance(first: number, second: number) {
  const direct = Math.abs(first - second);
  return Math.min(direct, 7 - direct);
}

function eventNeedsElevation(input: ConservativeRunPlanInput) {
  return (
    input.targetEventType === "fell_race" ||
    input.targetEventType.startsWith("spartan") ||
    (input.targetElevationMeters ?? 0) > 0
  );
}

function weekPhase(
  weekNumber: number,
  totalWeeks: number,
  recoveryWeek: boolean,
): ConservativeRunPlanWeek["phase"] {
  const taperWeeks = totalWeeks >= 8 ? 2 : totalWeeks >= 4 ? 1 : 0;
  if (taperWeeks > 0 && weekNumber > totalWeeks - taperWeeks) return "taper";
  if (recoveryWeek) return "recovery";
  if (weekNumber > totalWeeks - taperWeeks - 3) return "specific";
  return weekNumber <= Math.min(3, totalWeeks) ? "base" : "build";
}

function chooseRunDays(
  input: ConservativeRunPlanInput,
  warnings: string[],
): number[] {
  const restDays = new Set(input.restDays.map((day) => clamp(Math.round(day), 0, 6)));
  const commitmentDays = new Set(
    (input.commitments ?? []).map((commitment) => commitment.dayOfWeek),
  );
  const costlyCommitmentDays = new Set(
    (input.commitments ?? [])
      .filter((commitment) => commitment.lowerBodyLoad !== "low")
      .map((commitment) => commitment.dayOfWeek),
  );
  const distinctTrainingCommitments = commitmentDays.size;
  const runningDayCapacity = Math.max(
    0,
    input.maximumWeeklyTrainingDays - distinctTrainingCommitments,
  );
  const requested = clamp(Math.round(input.runningDaysPerWeek), 0, 7);
  const desired = Math.min(requested, runningDayCapacity);
  const preferred = Array.from({ length: 7 }, (_, day) => day).filter(
    (day) => !restDays.has(day) && !costlyCommitmentDays.has(day),
  );
  const fallback = Array.from({ length: 7 }, (_, day) => day).filter(
    (day) => !restDays.has(day) && !commitmentDays.has(day),
  );
  const candidates = Array.from(new Set([...preferred, ...fallback]));

  if (desired < requested) {
    warnings.push(
      `Running days were reduced from ${requested} to ${desired} to respect the maximum weekly training-day setting and fixed commitments.`,
    );
  }

  if (candidates.length < desired) {
    warnings.push(
      "Available rest days and commitments leave fewer safe running days than requested.",
    );
  }

  const count = Math.min(desired, candidates.length);
  const longDay = candidates.includes(input.preferredLongRunDay)
    ? input.preferredLongRunDay
    : candidates
        .slice()
        .sort(
          (first, second) =>
            circularDistance(first, input.preferredLongRunDay) -
              circularDistance(second, input.preferredLongRunDay) ||
            first - second,
        )[0];

  if (
    longDay !== undefined &&
    longDay !== input.preferredLongRunDay
  ) {
    warnings.push(
      `Preferred long-run day ${input.preferredLongRunDay} was unavailable; day ${longDay} was selected.`,
    );
  }

  if (count === 0 || longDay === undefined) return [];

  const selected = [longDay];
  const remaining = candidates
    .filter((day) => day !== longDay)
    .sort((first, second) => {
      const firstSpacing = Math.min(
        ...selected.map((day) => circularDistance(first, day)),
      );
      const secondSpacing = Math.min(
        ...selected.map((day) => circularDistance(second, day)),
      );
      return secondSpacing - firstSpacing || first - second;
    });

  while (selected.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestSpacing = -1;

    remaining.forEach((candidate, index) => {
      const spacing = Math.min(
        ...selected.map((day) => circularDistance(candidate, day)),
      );
      if (spacing > bestSpacing) {
        bestSpacing = spacing;
        bestIndex = index;
      }
    });
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.sort((first, second) => first - second);
}

function familyForQuality(
  phase: ConservativeRunPlanWeek["phase"],
  elevationEvent: boolean,
): RunSessionFamily {
  if (phase === "base") return "strides";
  if (phase === "build") return elevationEvent ? "hill_reps" : "threshold";
  if (phase === "specific") return elevationEvent ? "fell_trail" : "race_specific";
  if (phase === "taper") return "taper";
  return "easy";
}

function sessionsForWeek(
  input: ConservativeRunPlanInput,
  weekNumber: number,
  phase: ConservativeRunPlanWeek["phase"],
  runDays: number[],
  targetDistanceKm: number,
  targetElevationMeters: number,
): PlannedRunSession[] {
  if (runDays.length === 0) return [];

  const longDay = runDays.includes(input.preferredLongRunDay)
    ? input.preferredLongRunDay
    : runDays
        .slice()
        .sort(
          (first, second) =>
            circularDistance(first, input.preferredLongRunDay) -
              circularDistance(second, input.preferredLongRunDay) ||
            first - second,
        )[0];
  const highLowerBodyDays = new Set(
    (input.commitments ?? [])
      .filter((commitment) => commitment.lowerBodyLoad === "high")
      .map((commitment) => commitment.dayOfWeek),
  );
  const qualityCandidates = runDays
    .filter((day) => day !== longDay)
    .filter((day) => !highLowerBodyDays.has((day + 6) % 7))
    .sort(
      (first, second) =>
        circularDistance(second, longDay) -
          circularDistance(first, longDay) ||
        first - second,
    );
  const qualityDay =
    runDays.length >= 3 && phase !== "recovery"
      ? qualityCandidates[0]
      : undefined;
  const longShare = runDays.length <= 2 ? 0.4 : 0.32;
  const qualityShare = qualityDay === undefined ? 0 : phase === "taper" ? 0.14 : 0.2;
  const longDistance = round(targetDistanceKm * longShare, 1);
  const qualityDistance = round(targetDistanceKm * qualityShare, 1);
  const easyDays = runDays.filter(
    (day) => day !== longDay && day !== qualityDay,
  );
  const easyTotal = Math.max(
    0,
    targetDistanceKm - longDistance - qualityDistance,
  );
  const easyDistance =
    easyDays.length > 0 ? round(easyTotal / easyDays.length, 1) : 0;
  const elevationEvent = eventNeedsElevation(input);

  const sessions = runDays.map((day): PlannedRunSession => {
    if (day === longDay) {
      return {
        id: makeStableId("run_session", input.startDate, weekNumber, day, "long"),
        family: elevationEvent && phase === "specific" ? "fell_trail" : "long",
        dayOfWeek: day,
        distanceKm: longDistance,
        elevationMeters: Math.round(targetElevationMeters * 0.65),
        intensity: "easy",
        rationale:
          "Long aerobic durability; capped as a minority of weekly distance.",
      };
    }

    if (day === qualityDay) {
      const family = familyForQuality(phase, elevationEvent);
      return {
        id: makeStableId("run_session", input.startDate, weekNumber, day, family),
        family,
        dayOfWeek: day,
        distanceKm: qualityDistance,
        elevationMeters: Math.round(targetElevationMeters * 0.25),
        intensity:
          family === "strides" || family === "taper" ? "moderate" : "hard",
        rationale:
          "One controlled quality exposure; not scheduled immediately after a known high lower-body commitment.",
      };
    }

    return {
      id: makeStableId("run_session", input.startDate, weekNumber, day, "easy"),
      family: phase === "recovery" ? "recovery" : "easy",
      dayOfWeek: day,
      distanceKm: easyDistance,
      elevationMeters:
        easyDays.length > 0
          ? Math.round((targetElevationMeters * 0.1) / easyDays.length)
          : 0,
      intensity: "easy",
      rationale: "Easy aerobic support around hybrid commitments.",
    };
  });
  const distanceRemainder = round(
    targetDistanceKm -
      sessions.reduce((total, session) => total + session.distanceKm, 0),
    1,
  );
  const elevationRemainder =
    Math.round(targetElevationMeters) -
    sessions.reduce((total, session) => total + session.elevationMeters, 0);
  const longSession = sessions.find((session) => session.dayOfWeek === longDay);

  if (longSession) {
    longSession.distanceKm = round(
      Math.max(0, longSession.distanceKm + distanceRemainder),
      1,
    );
    longSession.elevationMeters = Math.max(
      0,
      longSession.elevationMeters + elevationRemainder,
    );
  }

  return sessions.sort((first, second) => first.dayOfWeek - second.dayOfWeek);
}

export function buildConservativeRunPlan(
  input: ConservativeRunPlanInput,
): ConservativeRunPlan {
  const warnings: string[] = [];
  const planDays = daysBetween(input.startDate, input.targetDate);
  const rawWeeks = Number.isFinite(planDays)
    ? Math.max(0, Math.ceil((planDays + 1) / 7))
    : 0;
  const totalWeeks = Math.min(rawWeeks, 24);

  if (rawWeeks <= 0) {
    warnings.push("Target date must be after the plan start date.");
  }
  if (rawWeeks > 24) {
    warnings.push(
      "The generated foundation is limited to 24 weeks; re-plan later rather than extrapolating load indefinitely.",
    );
  }
  if (input.targetTimeSeconds) {
    warnings.push(
      "Target time is recorded but does not increase mileage or intensity beyond conservative guardrails.",
    );
  }

  const recentDistance = average(input.recentWeeklyDistanceKm);
  const recentElevation = average(input.recentWeeklyElevationMeters);
  const distanceBaseline =
    recentDistance !== undefined
      ? Math.min(
          Math.max(0, input.currentWeeklyDistanceKm),
          recentDistance * 1.05,
        )
      : Math.max(0, input.currentWeeklyDistanceKm);
  let elevationBaseline =
    recentElevation !== undefined
      ? Math.min(
          Math.max(0, input.currentWeeklyElevationMeters),
          recentElevation * 1.1,
        )
      : Math.max(0, input.currentWeeklyElevationMeters);

  if (input.currentWeeklyDistanceKm <= 0 && recentDistance === undefined) {
    warnings.push(
      "No recent mileage baseline is available; the plan records zero distance rather than inventing a starting load.",
    );
  }
  if (eventNeedsElevation(input) && elevationBaseline === 0 && distanceBaseline > 0) {
    elevationBaseline = 50;
    warnings.push(
      "No elevation baseline was supplied; elevation starts at a conservative 50m per week.",
    );
  }

  const trainingAgeYears = Math.max(0, input.trainingAgeYears ?? 0);
  const weeklyGrowthRate = trainingAgeYears < 1 ? 0.05 : 0.07;
  const maximumWeeklyDistance = Math.max(
    0,
    input.maximumWeeklyDistanceKm ??
      Math.max(distanceBaseline, distanceBaseline * 1.35),
  );
  const maximumWeeklyElevation = Math.max(
    elevationBaseline,
    elevationBaseline * 1.6,
  );
  const runDayWarnings: string[] = [];
  const runDays = chooseRunDays(input, runDayWarnings);
  warnings.push(...runDayWarnings);
  const weeks: ConservativeRunPlanWeek[] = [];
  let peakDistance = Math.min(distanceBaseline, maximumWeeklyDistance);
  let peakElevation = Math.min(elevationBaseline, maximumWeeklyElevation);

  for (let index = 0; index < totalWeeks; index += 1) {
    const weekNumber = index + 1;
    const recoveryWeek = weekNumber % 4 === 0;
    const phase = weekPhase(weekNumber, totalWeeks, recoveryWeek);
    let targetDistance = peakDistance;
    let targetElevation = peakElevation;

    if (weekNumber > 1 && !recoveryWeek && phase !== "taper") {
      peakDistance = Math.min(
        maximumWeeklyDistance,
        peakDistance * (1 + weeklyGrowthRate),
      );
      peakElevation = Math.min(
        maximumWeeklyElevation,
        peakElevation * 1.1,
      );
      targetDistance = peakDistance;
      targetElevation = peakElevation;
    }

    if (recoveryWeek) {
      targetDistance = peakDistance * 0.82;
      targetElevation = peakElevation * 0.75;
    }

    if (phase === "taper") {
      const weeksRemaining = totalWeeks - weekNumber;
      const taperMultiplier = weeksRemaining === 0 ? 0.58 : 0.75;
      targetDistance = peakDistance * taperMultiplier;
      targetElevation = peakElevation * taperMultiplier;
    }

    targetDistance = round(targetDistance, 1);
    targetElevation = Math.round(targetElevation);
    const weekWarnings: string[] = [];

    if (runDays.length < 2 && targetDistance > 0) {
      weekWarnings.push(
        "Fewer than two safe running days are available; do not compress the target distance into one hard session.",
      );
      targetDistance = 0;
      targetElevation = 0;
    }

    weeks.push({
      weekNumber,
      phase,
      startDate: addDays(input.startDate, index * 7),
      targetDistanceKm: targetDistance,
      targetElevationMeters: targetElevation,
      sessions: sessionsForWeek(
        input,
        weekNumber,
        phase,
        runDays,
        targetDistance,
        targetElevation,
      ),
      warnings: weekWarnings,
    });
  }

  return {
    input: {
      ...input,
      restDays: [...input.restDays],
      recentWeeklyDistanceKm: input.recentWeeklyDistanceKm
        ? [...input.recentWeeklyDistanceKm]
        : undefined,
      recentWeeklyElevationMeters: input.recentWeeklyElevationMeters
        ? [...input.recentWeeklyElevationMeters]
        : undefined,
      commitments: input.commitments?.map((commitment) => ({ ...commitment })),
    },
    weeks,
    guardrails: [
      `Normal build weeks are capped at ${Math.round(weeklyGrowthRate * 100)}% mileage growth.`,
      "Every fourth week reduces distance and elevation unless tapering takes precedence.",
      "Target time never forces a faster mileage ramp.",
      "Quality running is limited to one controlled exposure per week in this foundation.",
      "Known high lower-body commitments block quality running on the following day where alternatives exist.",
      "Both weekly distance and elevation are explicit plan outputs.",
    ],
    warnings,
  };
}
