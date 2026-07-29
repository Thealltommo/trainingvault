import { makeStableId } from "./ids";
import { classifySessionLoad } from "./load";
import type {
  AthleteSession,
  AthleteSessionBlock,
  ManualMovement,
  ManualSessionDraft,
  SessionPrescription,
} from "./types";
import { buildSessionVariants, clonePrescription } from "./variants";

const liftTerms = [
  "back squat",
  "front squat",
  "deadlift",
  "bench press",
  "strict press",
  "push press",
  "clean",
  "snatch",
  "thruster",
];

const metconTerms = [
  "amrap",
  "emom",
  "for time",
  "rounds for time",
  "chipper",
  "tabata",
];

function cleanMovementName(value: string) {
  return value
    .replace(/^\d+\s+/, "")
    .replace(/\b\d+\s*[x×]\s*\d+\b/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|lb|lbs)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—:]+|[-–—:]+$/g, "")
    .trim();
}

function parseMovement(line: string): ManualMovement | null {
  const normalized = line.trim();

  if (!normalized || /^then$/i.test(normalized)) {
    return null;
  }

  const schemeMatch = normalized.match(/\b(\d+\s*[x×]\s*\d+)\b/i);
  const leadingReps = normalized.match(/^(\d+)\s+(?!min(?:ute)?s?\b)(.+)$/i);
  const loadMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|lb|lbs)\b/i);
  const name = cleanMovementName(
    leadingReps?.[2] ?? normalized,
  );

  if (!name || metconTerms.some((term) => name.toLowerCase().includes(term))) {
    return null;
  }

  return {
    name,
    reps: leadingReps ? Number(leadingReps[1]) : undefined,
    scheme: schemeMatch?.[1]?.replace(/\s+/g, "").replace("×", "x"),
    load: loadMatch ? Number(loadMatch[1]) : undefined,
    loadUnit: loadMatch
      ? loadMatch[2].toLowerCase().startsWith("kg")
        ? "kg"
        : "lb"
      : undefined,
    raw: normalized,
  };
}

function createBlock(
  sourceId: string,
  name: string,
  type: string,
  items: string[],
  durationMinutes?: number,
): AthleteSessionBlock {
  return {
    id: makeStableId("manual_block", sourceId, name, type, items.join("|")),
    name,
    type,
    durationMinutes,
    items: [...items],
  };
}

function draftPrescription(
  draft: Omit<ManualSessionDraft, "load">,
): SessionPrescription {
  return {
    title: draft.title,
    category: draft.category,
    sessionType: draft.category === "crossfit" ? "Hawkeye / CrossFit" : undefined,
    durationMinutes: draft.durationMinutes ?? 45,
    intensity:
      draft.rpe !== undefined
        ? draft.rpe >= 8
          ? "hard"
          : draft.rpe <= 4
            ? "easy"
            : "moderate"
        : "moderate",
    focus: Array.from(
      new Set(
        [...draft.mainLifts, ...draft.movements]
          .map((movement) => movement.name.toLowerCase())
          .slice(0, 8),
      ),
    ),
    equipment: [],
    blocks: draft.blocks,
    targets: {
      targetStimulus: draft.metcon
        ? "Complete the recorded mixed-modal session with controlled movement quality."
        : "Complete the recorded manual session as written.",
    },
    substitutions: [],
    scalingNotes:
      "Manual deterministic parse: verify movements, loads, and duration before saving.",
  };
}

export function parseManualHawkeyeText(
  text: string,
  options: {
    title?: string;
    category?: ManualSessionDraft["category"];
    durationMinutes?: number;
    rpe?: number;
  } = {},
): ManualSessionDraft {
  const sourceText = text.trim();
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const metconIndex = lines.findIndex((line) =>
    metconTerms.some((term) => line.toLowerCase().includes(term)),
  );
  const thenIndex = lines.findIndex((line) => /^then$/i.test(line));
  const splitIndex = metconIndex >= 0 ? metconIndex : thenIndex;
  const durationMatch = sourceText.match(/(\d+)\s*min(?:ute)?s?\b/i);
  const rpeMatch = sourceText.match(/\brpe\s*[:=-]?\s*(10|[1-9])\b/i);
  const parsedMovements = lines
    .map(parseMovement)
    .filter((movement): movement is ManualMovement => Boolean(movement));
  const mainLifts = parsedMovements.filter((movement) =>
    liftTerms.some((term) => movement.name.toLowerCase().includes(term)),
  );
  const metconLines =
    splitIndex >= 0
      ? lines.slice(splitIndex).filter((line) => !/^then$/i.test(line))
      : lines.filter((line) =>
          metconTerms.some((term) => line.toLowerCase().includes(term)),
        );
  const strengthLines =
    splitIndex > 0
      ? lines.slice(0, splitIndex).filter((line) => !/^then$/i.test(line))
      : mainLifts.map((movement) => movement.raw);
  const durationMinutes =
    options.durationMinutes ??
    (durationMatch ? Number(durationMatch[1]) : undefined);
  const rpe = options.rpe ?? (rpeMatch ? Number(rpeMatch[1]) : undefined);
  const sourceId = makeStableId("manual_parse", sourceText);
  const blocks: AthleteSessionBlock[] = [];

  if (strengthLines.length > 0) {
    blocks.push(
      createBlock(sourceId, "Main lifts", "strength", strengthLines),
    );
  }

  if (metconLines.length > 0) {
    blocks.push(
      createBlock(
        sourceId,
        "Metcon",
        "conditioning",
        metconLines,
        durationMinutes,
      ),
    );
  }

  if (blocks.length === 0 && lines.length > 0) {
    blocks.push(createBlock(sourceId, "Session", "custom", lines, durationMinutes));
  }

  const parsedLineSet = new Set([
    ...strengthLines,
    ...metconLines,
    ...parsedMovements.map((movement) => movement.raw),
  ]);
  const notes = lines.filter(
    (line) =>
      !parsedLineSet.has(line) &&
      !/^then$/i.test(line) &&
      !/\brpe\s*[:=-]?\s*(10|[1-9])\b/i.test(line),
  );
  const category =
    options.category ??
    (metconLines.length > 0
      ? "crossfit"
      : mainLifts.length > 0
        ? "strength"
        : "custom");
  const draftWithoutLoad: Omit<ManualSessionDraft, "load"> = {
    title:
      options.title ??
      (category === "crossfit" ? "Manual Hawkeye Session" : "Manual Session"),
    category,
    durationMinutes,
    rpe,
    mainLifts,
    movements: parsedMovements,
    metcon: metconLines.length > 0 ? metconLines.join("\n") : undefined,
    notes,
    blocks,
    sourceText,
    parseWarnings: [
      ...(sourceText ? [] : ["No session text was supplied."]),
      ...(parsedMovements.length === 0
        ? ["No movements were confidently parsed; retain the raw text for manual editing."]
        : []),
      ...(durationMinutes === undefined
        ? ["Duration was not found and should be entered manually."]
        : []),
    ],
  };
  const prescription = draftPrescription(draftWithoutLoad);

  return {
    ...draftWithoutLoad,
    load: classifySessionLoad(prescription),
  };
}

export function manualDraftToAthleteSession(
  draft: ManualSessionDraft,
  options: {
    athleteId?: string;
    date?: string;
    sourceId?: string;
  } = {},
): AthleteSession {
  const sourceId =
    options.sourceId ??
    makeStableId("manual_source", options.date, draft.sourceText);
  const sessionId = makeStableId("session", "manual", sourceId);
  const prescription = {
    ...draftPrescription(draft),
    date: options.date,
  };
  const variants = buildSessionVariants(sessionId, prescription);

  return {
    id: sessionId,
    athleteId: options.athleteId,
    source: {
      kind: "manual",
      sourceId,
    },
    status: "planned",
    isModified: false,
    originalPrescription: clonePrescription(prescription),
    currentPrescription: clonePrescription(prescription),
    completionHistory: [],
    variants,
    selectedVariant: "full",
    plannedLoad: draft.load,
    integration: {
      garminSyncState: "not_sent",
    },
    migrationWarnings: [],
    metadata: {
      parser: "deterministic_hawkeye_v1",
      parseWarnings: draft.parseWarnings,
    },
  };
}
