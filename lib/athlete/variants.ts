import { clamp, makeStableId } from "./ids";
import { classifySessionLoad } from "./load";
import type {
  AthleteSession,
  AthleteSessionBlock,
  SessionPrescription,
  SessionVariant,
  SessionVariantKind,
} from "./types";

export type VariantBuildOptions = {
  adjustedPrescription?: Partial<SessionPrescription>;
  minimumPrescription?: Partial<SessionPrescription>;
  adjustedRationale?: string;
  minimumRationale?: string;
};

export function clonePrescription(prescription: SessionPrescription): SessionPrescription {
  return {
    ...prescription,
    focus: [...prescription.focus],
    equipment: [...prescription.equipment],
    substitutions: [...prescription.substitutions],
    targets: {
      ...prescription.targets,
      paceRangeSecondsPerKm: prescription.targets.paceRangeSecondsPerKm
        ? [...prescription.targets.paceRangeSecondsPerKm]
        : undefined,
      heartRateRange: prescription.targets.heartRateRange
        ? [...prescription.targets.heartRateRange]
        : undefined,
    },
    blocks: prescription.blocks.map((block) => ({
      ...block,
      items: [...block.items],
    })),
  };
}

function mergePrescription(
  base: SessionPrescription,
  update: Partial<SessionPrescription> | undefined,
): SessionPrescription {
  if (!update) {
    return clonePrescription(base);
  }

  return {
    ...clonePrescription(base),
    ...update,
    focus: update.focus ? [...update.focus] : [...base.focus],
    equipment: update.equipment ? [...update.equipment] : [...base.equipment],
    substitutions: update.substitutions ? [...update.substitutions] : [...base.substitutions],
    targets: {
      ...base.targets,
      ...(update.targets ?? {}),
    },
    blocks: update.blocks
      ? update.blocks.map((block) => ({ ...block, items: [...block.items] }))
      : base.blocks.map((block) => ({ ...block, items: [...block.items] })),
  };
}

function scaleBlockDurations(blocks: AthleteSessionBlock[], targetMinutes: number) {
  const knownMinutes = blocks.reduce((total, block) => total + (block.durationMinutes ?? 0), 0);

  if (knownMinutes <= 0) {
    return blocks.map((block) => ({ ...block, items: [...block.items] }));
  }

  const ratio = targetMinutes / knownMinutes;
  return blocks.map((block) => ({
    ...block,
    durationMinutes:
      block.durationMinutes === undefined
        ? undefined
        : Math.max(1, Math.round(block.durationMinutes * ratio)),
    items: [...block.items],
  }));
}

function minimumBlocks(blocks: AthleteSessionBlock[]) {
  if (blocks.length <= 2) {
    return blocks.map((block) => ({ ...block, items: [...block.items] }));
  }

  const warmup = blocks.find((block) => /warm|prep/i.test(`${block.type} ${block.name}`));
  const main =
    blocks.find((block) =>
      /interval|strength|conditioning|metcon|main|skill/i.test(`${block.type} ${block.name}`),
    ) ?? blocks[0];
  const cooldown = blocks.find((block) => /cool|mobility|downshift/i.test(`${block.type} ${block.name}`));
  const selected = [warmup, main, cooldown].filter(
    (block, index, values): block is AthleteSessionBlock =>
      Boolean(block) && values.findIndex((candidate) => candidate?.id === block?.id) === index,
  );

  return selected.map((block) => ({ ...block, items: [...block.items] }));
}

function variant(
  sessionId: string,
  kind: SessionVariantKind,
  prescription: SessionPrescription,
  costMultiplier: number,
  rationale: string,
  adjustments: string[],
): SessionVariant {
  const labels = {
    full: "FULL",
    adjusted: "ADJUSTED",
    minimum: "MINIMUM",
  } as const;

  return {
    id: makeStableId("variant", sessionId, kind),
    kind,
    label: labels[kind],
    prescription,
    costMultiplier,
    rationale,
    adjustments,
  };
}

const intensityOrder: Record<SessionPrescription["intensity"], number> = {
  easy: 0,
  moderate: 1,
  hard: 2,
};

function capVariantPrescription(
  base: SessionPrescription,
  candidate: SessionPrescription,
  maximumMinutes: number,
): SessionPrescription {
  const durationMinutes =
    maximumMinutes <= 0
      ? 0
      : clamp(Math.round(candidate.durationMinutes), 1, maximumMinutes);
  const intensity =
    intensityOrder[candidate.intensity] > intensityOrder[base.intensity]
      ? base.intensity
      : candidate.intensity;

  return {
    ...clonePrescription(candidate),
    durationMinutes,
    minimumMinutes:
      candidate.minimumMinutes === undefined
        ? undefined
        : clamp(Math.round(candidate.minimumMinutes), 0, durationMinutes),
    intensity,
    blocks:
      candidate.durationMinutes === durationMinutes
        ? candidate.blocks.map((block) => ({
            ...block,
            items: [...block.items],
          }))
        : scaleBlockDurations(candidate.blocks, durationMinutes),
  };
}

export function buildSessionVariants(
  sessionId: string,
  basePrescription: SessionPrescription,
  options: VariantBuildOptions = {},
): Record<SessionVariantKind, SessionVariant> {
  const full = clonePrescription(basePrescription);
  const adjustedMinutes =
    full.durationMinutes <= 0
      ? 0
      : Math.min(
          full.durationMinutes,
          Math.max(
            clamp(
              Math.round(basePrescription.minimumMinutes ?? 1),
              1,
              full.durationMinutes,
            ),
            Math.round(full.durationMinutes * 0.75),
          ),
        );
  const adjustedBase: SessionPrescription = {
    ...clonePrescription(basePrescription),
    durationMinutes: adjustedMinutes,
    blocks: scaleBlockDurations(basePrescription.blocks, adjustedMinutes),
    scalingNotes:
      basePrescription.scalingNotes ??
      "Preserve the intended stimulus with reduced volume and no increase in intensity.",
  };
  const adjusted = capVariantPrescription(
    full,
    mergePrescription(adjustedBase, options.adjustedPrescription),
    full.durationMinutes,
  );

  const inferredMinimum =
    full.durationMinutes <= 0
      ? 0
      : Math.max(15, Math.round(full.durationMinutes * 0.5));
  const minimumMinutes = Math.min(
    full.durationMinutes,
    basePrescription.minimumMinutes ?? inferredMinimum,
  );
  const selectedMinimumBlocks = minimumBlocks(basePrescription.blocks);
  const minimumBase: SessionPrescription = {
    ...clonePrescription(basePrescription),
    durationMinutes: minimumMinutes,
    minimumMinutes,
    blocks: scaleBlockDurations(selectedMinimumBlocks, minimumMinutes),
    scalingNotes:
      basePrescription.scalingNotes ??
      "Complete the smallest useful dose: prepare, touch the main stimulus, then finish.",
  };
  const minimum = capVariantPrescription(
    full,
    mergePrescription(minimumBase, options.minimumPrescription),
    adjusted.durationMinutes,
  );
  const adjustedCostMultiplier =
    full.durationMinutes > 0
      ? clamp(adjusted.durationMinutes / full.durationMinutes, 0.25, 0.9)
      : 0;
  const minimumCostMultiplier = clamp(
    full.durationMinutes > 0
      ? minimum.durationMinutes / full.durationMinutes
      : 0,
    0,
    0.65,
  );

  return {
    full: variant(
      sessionId,
      "full",
      full,
      1,
      "The complete intended prescription.",
      [],
    ),
    adjusted: variant(
      sessionId,
      "adjusted",
      adjusted,
      adjustedCostMultiplier,
      options.adjustedRationale ??
        "Preserves the main stimulus while reducing volume and recovery cost.",
      [
        `Target duration reduced from ${full.durationMinutes} to ${adjusted.durationMinutes} minutes.`,
        "Intensity is not increased to compensate for reduced volume.",
      ],
    ),
    minimum: variant(
      sessionId,
      "minimum",
      minimum,
      minimumCostMultiplier,
      options.minimumRationale ??
        "The smallest useful version when time or recovery is constrained.",
      [
        `Target duration reduced from ${full.durationMinutes} to ${minimum.durationMinutes} minutes.`,
        "Only essential preparation, main stimulus, and downshift blocks are retained where available.",
      ],
    ),
  };
}

export function selectSessionVariant(
  session: AthleteSession,
  kind: SessionVariantKind,
  reason: string,
): AthleteSession {
  const selected = session.variants[kind];
  const status =
    session.status === "completed" || session.status === "skipped"
      ? session.status
      : kind === "full" && !session.isModified
        ? "planned"
        : "modified";

  const selectedLoad = classifySessionLoad(selected.prescription);

  return {
    ...session,
    status,
    isModified: session.isModified || kind !== "full",
    modificationReason: reason || session.modificationReason,
    selectedVariant: kind,
    currentPrescription: clonePrescription(selected.prescription),
    plannedLoad: {
      ...selectedLoad,
      factors: [
        ...selectedLoad.factors,
        `${selected.label} variant selected: ${reason || selected.rationale}`,
      ],
    },
  };
}
