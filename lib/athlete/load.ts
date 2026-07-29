import { clamp } from "./ids";
import type {
  SessionLoadAxis,
  SessionLoadClassification,
  SessionLoadScores,
  SessionPrescription,
} from "./types";

const keywords: Record<SessionLoadAxis, string[]> = {
  lowerBody: [
    "run",
    "squat",
    "lunge",
    "deadlift",
    "clean",
    "snatch",
    "wall ball",
    "sled",
    "box jump",
    "step over",
    "thruster",
    "bike",
    "row",
    "fell",
    "trail",
    "hill",
  ],
  upperBody: [
    "press",
    "push-up",
    "pull-up",
    "row",
    "dip",
    "handstand",
    "muscle-up",
    "ring",
    "shoulder",
    "bench",
  ],
  mixed: [
    "crossfit",
    "hybrid",
    "hyrox",
    "metcon",
    "amrap",
    "emom",
    "for time",
    "mixed",
    "competition",
  ],
  aerobic: [
    "easy",
    "zone 2",
    "steady",
    "long run",
    "jog",
    "run",
    "row",
    "bike",
    "hike",
    "endurance",
    "recovery",
  ],
  anaerobic: [
    "sprint",
    "interval",
    "vo2",
    "threshold",
    "amrap",
    "emom",
    "for time",
    "hard",
    "metcon",
    "race",
  ],
  eccentric: [
    "downhill",
    "fell",
    "trail",
    "lunge",
    "negative",
    "tempo squat",
    "box jump",
    "running",
  ],
  grip: [
    "grip",
    "carry",
    "farmer",
    "pull-up",
    "toes-to-bar",
    "deadlift",
    "clean",
    "snatch",
    "kettlebell",
    "sandbag",
    "rope",
  ],
  impact: [
    "run",
    "sprint",
    "jump",
    "burpee",
    "box",
    "fell",
    "trail",
    "plyometric",
    "spartan",
  ],
};

function emptyScores(): SessionLoadScores {
  return {
    lowerBody: 0,
    upperBody: 0,
    mixed: 0,
    aerobic: 0,
    anaerobic: 0,
    eccentric: 0,
    grip: 0,
    impact: 0,
  };
}

function prescriptionSignal(prescription: SessionPrescription) {
  return [
    prescription.title,
    prescription.category,
    prescription.legacyCategory,
    prescription.sessionType,
    prescription.intensity,
    ...prescription.focus,
    ...prescription.equipment,
    ...prescription.blocks.flatMap((block) => [block.name, block.type, ...block.items]),
    prescription.targets.targetStimulus,
    prescription.targets.prescribedLoadsOrPace,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function keywordScore(signal: string, terms: string[]) {
  const matches = terms.filter((term) => signal.includes(term));
  return {
    score: clamp(matches.length, 0, 5),
    matches,
  };
}

export function classifySessionLoad(
  prescription: SessionPrescription,
): SessionLoadClassification {
  const signal = prescriptionSignal(prescription);
  const scores = emptyScores();
  const factors: string[] = [];

  (Object.keys(keywords) as SessionLoadAxis[]).forEach((axis) => {
    const result = keywordScore(signal, keywords[axis]);
    scores[axis] = result.score;

    if (result.matches.length > 0) {
      factors.push(
        `${axis}: ${result.matches.slice(0, 3).join(", ")}`,
      );
    }
  });

  if (prescription.category === "strength") {
    scores.anaerobic = Math.max(scores.anaerobic, 2);
  }

  if (
    prescription.category === "crossfit" ||
    prescription.category === "hybrid" ||
    prescription.category === "hyrox"
  ) {
    scores.mixed = Math.max(scores.mixed, 4);
    scores.anaerobic = Math.max(scores.anaerobic, 3);
  }

  if (
    prescription.category === "run" ||
    prescription.category === "trail" ||
    prescription.category === "hike"
  ) {
    scores.aerobic = Math.max(scores.aerobic, prescription.intensity === "easy" ? 4 : 3);
    scores.lowerBody = Math.max(scores.lowerBody, 3);
    scores.impact = Math.max(
      scores.impact,
      prescription.category === "hike" ? 1 : 3,
    );
  }

  if (prescription.category === "trail") {
    scores.eccentric = Math.max(scores.eccentric, 3);
  }

  if (prescription.category === "recovery" || prescription.category === "rest") {
    (Object.keys(scores) as SessionLoadAxis[]).forEach((axis) => {
      scores[axis] = Math.min(scores[axis], axis === "aerobic" ? 2 : 1);
    });
  }

  if (scores.lowerBody >= 2 && scores.upperBody >= 2) {
    scores.mixed = Math.max(scores.mixed, 3);
  }

  const intensityMultiplier = {
    easy: 0.65,
    moderate: 0.95,
    hard: 1.25,
  }[prescription.intensity];
  const axisAverage =
    Object.values(scores).reduce((total, value) => total + value, 0) /
    Object.keys(scores).length;
  const plannedCost = clamp(
    Math.round(
      prescription.durationMinutes *
        intensityMultiplier *
        (0.65 + axisAverage / 10),
    ),
    0,
    100,
  );
  const matchedFactorCount = factors.length;

  return {
    scores,
    plannedCost,
    confidence:
      matchedFactorCount >= 5
        ? "high"
        : matchedFactorCount >= 2
          ? "medium"
          : "low",
    factors:
      factors.length > 0
        ? factors
        : ["Limited structured detail; load estimate is low confidence."],
  };
}

export function combineSessionLoads(
  classifications: SessionLoadClassification[],
): SessionLoadClassification {
  const scores = emptyScores();

  classifications.forEach((classification) => {
    (Object.keys(scores) as SessionLoadAxis[]).forEach((axis) => {
      scores[axis] = clamp(scores[axis] + classification.scores[axis], 0, 5);
    });
  });

  return {
    scores,
    plannedCost: clamp(
      classifications.reduce(
        (total, classification) => total + classification.plannedCost,
        0,
      ),
      0,
      100,
    ),
    confidence:
      classifications.length === 0
        ? "low"
        : classifications.every((item) => item.confidence === "high")
          ? "high"
          : "medium",
    factors: classifications.flatMap((classification) => classification.factors),
  };
}
