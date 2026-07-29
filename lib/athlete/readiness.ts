import { clamp } from "./ids";
import type {
  DailyRecoveryInput,
  ReadinessAssessment,
  ReadinessFactor,
  ReadinessRecommendation,
  ReadinessZone,
} from "./types";

function factor(
  key: string,
  label: string,
  impact: number,
): ReadinessFactor {
  return {
    key,
    label,
    impact,
    direction: impact > 0 ? "positive" : impact < 0 ? "negative" : "neutral",
  };
}

function recommendationFor(
  zone: ReadinessZone,
  score: number,
  severeSignals: number,
): ReadinessRecommendation {
  if (zone === "GREEN") return "full";
  if (zone === "AMBER") return "adjusted";
  return score < 30 || severeSignals >= 2 ? "rest" : "minimum";
}

export function assessDailyReadiness(
  input: DailyRecoveryInput,
): ReadinessAssessment {
  const factors: ReadinessFactor[] = [];
  let score = 70;
  let severeSignals = 0;
  let suppliedSignals = 0;
  const possibleSignals = 10;

  if (input.sleepHours != null) {
    suppliedSignals += 1;
    if (input.sleepHours < 5.5) {
      factors.push(factor("sleep", `Very short sleep (${input.sleepHours.toFixed(1)}h).`, -22));
      severeSignals += 1;
    } else if (input.sleepHours < 6.5) {
      factors.push(factor("sleep", `Short sleep (${input.sleepHours.toFixed(1)}h).`, -12));
    } else if (input.sleepHours >= 7.5) {
      factors.push(factor("sleep", `Supportive sleep duration (${input.sleepHours.toFixed(1)}h).`, 6));
    } else {
      factors.push(factor("sleep", `Sleep duration is near the neutral range (${input.sleepHours.toFixed(1)}h).`, 0));
    }
  } else if (input.sleepScore != null) {
    suppliedSignals += 1;
    const impact = input.sleepScore < 45 ? -16 : input.sleepScore < 65 ? -7 : input.sleepScore >= 80 ? 5 : 0;
    factors.push(factor("sleep_score", `Sleep score ${input.sleepScore}.`, impact));
    if (input.sleepScore < 35) severeSignals += 1;
  }

  if (input.hrvMs != null && input.hrvBaselineMs != null && input.hrvBaselineMs > 0) {
    suppliedSignals += 1;
    const ratio = input.hrvMs / input.hrvBaselineMs;
    const impact = ratio < 0.8 ? -18 : ratio < 0.9 ? -8 : ratio >= 1.05 ? 4 : 0;
    factors.push(
      factor(
        "hrv",
        `HRV is ${Math.round(ratio * 100)}% of baseline.`,
        impact,
      ),
    );
    if (ratio < 0.72) severeSignals += 1;
  }

  if (
    input.restingHeartRate != null &&
    input.restingHeartRateBaseline != null
  ) {
    suppliedSignals += 1;
    const delta = input.restingHeartRate - input.restingHeartRateBaseline;
    const impact = delta >= 8 ? -15 : delta >= 5 ? -8 : delta <= -3 ? 3 : 0;
    factors.push(
      factor(
        "resting_hr",
        `Resting HR is ${delta >= 0 ? "+" : ""}${delta.toFixed(0)} bpm versus baseline.`,
        impact,
      ),
    );
    if (delta >= 10) severeSignals += 1;
  }

  if (input.garminReadiness != null) {
    suppliedSignals += 1;
    const impact =
      input.garminReadiness < 35
        ? -15
        : input.garminReadiness < 55
          ? -7
          : input.garminReadiness >= 75
            ? 5
            : 0;
    factors.push(
      factor(
        "garmin_readiness",
        `Garmin readiness is ${input.garminReadiness}.`,
        impact,
      ),
    );
  }

  if (
    input.recentLoad7d != null &&
    input.baselineLoad7d != null &&
    input.baselineLoad7d > 0
  ) {
    suppliedSignals += 1;
    const ratio = input.recentLoad7d / input.baselineLoad7d;
    const impact = ratio > 1.4 ? -14 : ratio > 1.2 ? -7 : ratio < 0.7 ? 2 : 0;
    factors.push(
      factor(
        "load_ratio",
        `Recent load is ${Math.round(ratio * 100)}% of baseline.`,
        impact,
      ),
    );
    if (ratio > 1.6) severeSignals += 1;
  }

  if (input.lowerBodyLoad48h != null) {
    suppliedSignals += 1;
    const impact =
      input.lowerBodyLoad48h >= 80
        ? -14
        : input.lowerBodyLoad48h >= 60
          ? -8
          : input.lowerBodyLoad48h >= 40
            ? -3
            : 0;
    factors.push(
      factor(
        "lower_body_load",
        `Lower-body load over 48h is ${input.lowerBodyLoad48h}/100.`,
        impact,
      ),
    );
  }

  if (input.highIntensitySessions72h != null) {
    suppliedSignals += 1;
    const impact =
      input.highIntensitySessions72h >= 3
        ? -10
        : input.highIntensitySessions72h === 2
          ? -5
          : 0;
    factors.push(
      factor(
        "high_intensity_density",
        `${input.highIntensitySessions72h} high-intensity session${input.highIntensitySessions72h === 1 ? "" : "s"} in 72h.`,
        impact,
      ),
    );
  }

  if (input.soreness != null) {
    suppliedSignals += 1;
    const impact =
      input.soreness >= 8
        ? -18
        : input.soreness >= 6
          ? -9
          : input.soreness <= 2
            ? 3
            : 0;
    factors.push(
      factor("soreness", `Subjective soreness is ${input.soreness}/10.`, impact),
    );
    if (input.soreness >= 9) severeSignals += 1;
  }

  if (input.subjectiveReadiness != null) {
    suppliedSignals += 1;
    const impact =
      input.subjectiveReadiness <= 3
        ? -15
        : input.subjectiveReadiness <= 5
          ? -7
          : input.subjectiveReadiness >= 8
            ? 5
            : 0;
    factors.push(
      factor(
        "subjective_readiness",
        `Subjective readiness is ${input.subjectiveReadiness}/10.`,
        impact,
      ),
    );
    if (input.subjectiveReadiness <= 2) severeSignals += 1;
  }

  if (input.daysSinceRest != null) {
    suppliedSignals += 1;
    const impact = input.daysSinceRest >= 8 ? -8 : input.daysSinceRest >= 6 ? -4 : 0;
    factors.push(
      factor(
        "days_since_rest",
        `${input.daysSinceRest} days since a rest day.`,
        impact,
      ),
    );
  }

  if (
    input.upcomingEventPriority === "A" &&
    input.upcomingEventDays != null &&
    input.upcomingEventDays >= 0 &&
    input.upcomingEventDays <= 3
  ) {
    factors.push(
      factor(
        "a_event_proximity",
        `A-priority event is ${input.upcomingEventDays} day${input.upcomingEventDays === 1 ? "" : "s"} away; protect freshness.`,
        -6,
      ),
    );
  }

  score = clamp(
    Math.round(score + factors.reduce((total, item) => total + item.impact, 0)),
    0,
    100,
  );
  const zone: ReadinessZone =
    score >= 70 ? "GREEN" : score >= 45 ? "AMBER" : "RED";
  const computedRecommendation = recommendationFor(zone, score, severeSignals);
  const manualOverrideApplied = Boolean(input.manualOverride);
  const recommendation =
    input.manualOverride ?? computedRecommendation;

  if (manualOverrideApplied) {
    factors.push(
      factor(
        "manual_override",
        `Athlete override selected ${recommendation.toUpperCase()}${input.manualOverrideReason ? `: ${input.manualOverrideReason}` : "."}`,
        0,
      ),
    );
  }

  if (suppliedSignals < 3) {
    factors.push(
      factor(
        "limited_data",
        "Limited recovery data; recommendation confidence is reduced.",
        0,
      ),
    );
  }

  return {
    date: input.date,
    score,
    zone,
    computedRecommendation,
    recommendation,
    factors,
    manualOverrideApplied,
    manualOverrideReason: input.manualOverrideReason ?? undefined,
    dataCompleteness: Math.round((suppliedSignals / possibleSignals) * 100),
    disclaimer:
      "TrainVault readiness is a training aid, not medical advice. Stop and seek appropriate help for illness, injury, chest pain, faintness, or unusual symptoms.",
  };
}
