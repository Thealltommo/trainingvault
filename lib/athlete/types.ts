export type ISODate = string;
export type ISODateTime = string;

export type SessionStatus = "planned" | "completed" | "skipped" | "modified";
export type SessionVariantKind = "full" | "adjusted" | "minimum";
export type ReadinessRecommendation = SessionVariantKind | "rest";
export type ReadinessZone = "GREEN" | "AMBER" | "RED";

export type AthleteSessionCategory =
  | "run"
  | "strength"
  | "crossfit"
  | "conditioning"
  | "hyrox"
  | "trail"
  | "hike"
  | "race"
  | "mobility"
  | "recovery"
  | "rest"
  | "gymnastics"
  | "hybrid"
  | "custom";

export type SessionIntensity = "easy" | "moderate" | "hard";

export type SessionLoadAxis =
  | "lowerBody"
  | "upperBody"
  | "mixed"
  | "aerobic"
  | "anaerobic"
  | "eccentric"
  | "grip"
  | "impact";

export type SessionLoadScores = Record<SessionLoadAxis, number>;

export type SessionLoadClassification = {
  scores: SessionLoadScores;
  plannedCost: number;
  confidence: "low" | "medium" | "high";
  factors: string[];
};

export type PrescriptionTargets = {
  distanceMeters?: number;
  elevationGainMeters?: number;
  paceSecondsPerKm?: number;
  paceRangeSecondsPerKm?: [number, number];
  heartRateRange?: [number, number];
  prescribedLoadsOrPace?: string;
  targetStimulus?: string;
};

export type AthleteSessionBlock = {
  id: string;
  legacyKey?: string;
  name: string;
  type: string;
  durationMinutes?: number;
  items: string[];
};

export type SessionPrescription = {
  title: string;
  category: AthleteSessionCategory;
  legacyCategory?: string;
  sessionType?: string;
  phase?: string;
  priority?: string;
  date?: ISODate;
  durationMinutes: number;
  minimumMinutes?: number;
  intensity: SessionIntensity;
  focus: string[];
  equipment: string[];
  blocks: AthleteSessionBlock[];
  targets: PrescriptionTargets;
  scalingNotes?: string;
  coachNotes?: string;
  substitutions: string[];
};

export type CompletedBlockResult = {
  blockId: string;
  legacyBlockKey?: string;
  blockName: string;
  status: "todo" | "done" | "skipped";
  result?: string;
  load?: string;
  reps?: string;
  time?: string;
  calories?: string;
  distance?: string;
  notes?: string;
};

export type CompletedPrescription = {
  logId: string;
  completedAt: ISODateTime;
  rpe: number;
  actualDurationMinutes?: number;
  actualDistanceMeters?: number;
  actualElevationGainMeters?: number;
  averageHeartRate?: number;
  score?: string;
  limiter?: string;
  notes?: string;
  blocks: CompletedBlockResult[];
};

export type SessionVariant = {
  id: string;
  kind: SessionVariantKind;
  label: "FULL" | "ADJUSTED" | "MINIMUM";
  prescription: SessionPrescription;
  costMultiplier: number;
  rationale: string;
  adjustments: string[];
};

export type AthleteSessionSource = {
  kind: "programme" | "manual" | "garmin" | "generated" | "custom";
  sourceId: string;
  legacyProgrammeId?: string;
  legacyWeekId?: string;
  legacyDayId?: string;
  legacyWorkoutId?: string;
  legacySessionLogIds?: string[];
};

export type SessionIntegrationState = {
  garminWorkoutId?: string;
  garminActivityId?: string;
  garminSyncState?: "not_sent" | "syncing" | "scheduled" | "sent_to_device" | "error";
};

export type AthleteSession = {
  id: string;
  athleteId?: string;
  source: AthleteSessionSource;
  status: SessionStatus;
  isModified: boolean;
  modificationReason?: string;
  originalPrescription: SessionPrescription;
  currentPrescription: SessionPrescription;
  completedPrescription?: CompletedPrescription;
  completionHistory: CompletedPrescription[];
  variants: Record<SessionVariantKind, SessionVariant>;
  selectedVariant: SessionVariantKind;
  plannedLoad: SessionLoadClassification;
  integration: SessionIntegrationState;
  migrationWarnings: string[];
  metadata: Record<string, string | number | boolean | string[] | undefined>;
};

export type ManualMovement = {
  name: string;
  reps?: number;
  scheme?: string;
  load?: number;
  loadUnit?: "kg" | "lb";
  raw: string;
};

export type ManualSessionDraft = {
  title: string;
  category: "crossfit" | "strength" | "conditioning" | "custom";
  durationMinutes?: number;
  rpe?: number;
  mainLifts: ManualMovement[];
  movements: ManualMovement[];
  metcon?: string;
  notes: string[];
  blocks: AthleteSessionBlock[];
  sourceText: string;
  load: SessionLoadClassification;
  parseWarnings: string[];
};

export type ReadinessFactor = {
  key: string;
  label: string;
  impact: number;
  direction: "positive" | "negative" | "neutral";
};

export type DailyRecoveryInput = {
  date: ISODate;
  sleepHours?: number | null;
  sleepScore?: number | null;
  hrvMs?: number | null;
  hrvBaselineMs?: number | null;
  restingHeartRate?: number | null;
  restingHeartRateBaseline?: number | null;
  garminReadiness?: number | null;
  recentLoad7d?: number | null;
  baselineLoad7d?: number | null;
  lowerBodyLoad48h?: number | null;
  highIntensitySessions72h?: number | null;
  soreness?: number | null;
  subjectiveReadiness?: number | null;
  daysSinceRest?: number | null;
  upcomingEventDays?: number | null;
  upcomingEventPriority?: "A" | "B" | "C" | null;
  manualOverride?: ReadinessRecommendation | null;
  manualOverrideReason?: string | null;
};

export type ReadinessAssessment = {
  date: ISODate;
  score: number;
  zone: ReadinessZone;
  computedRecommendation: ReadinessRecommendation;
  recommendation: ReadinessRecommendation;
  factors: ReadinessFactor[];
  manualOverrideApplied: boolean;
  manualOverrideReason?: string;
  dataCompleteness: number;
  disclaimer: string;
};

export type NormalizedActivityRecord = {
  id: string;
  source: "garmin" | "manual" | "other";
  sourceActivityId: string;
  type: string;
  title?: string;
  startTime: ISODateTime;
  durationSeconds?: number;
  distanceMeters?: number;
  elevationGainMeters?: number;
  averageHeartRate?: number;
  averagePaceSecondsPerKm?: number;
  garminWorkoutId?: string;
  rpe?: number;
};

export type ActivityMatchConfidence = "none" | "low" | "medium" | "high";

export type ActivityMatch = {
  sessionId: string;
  activityId: string;
  score: number;
  confidence: ActivityMatchConfidence;
  shouldAutoLink: boolean;
  ambiguous: boolean;
  reasons: string[];
};

export type PlannedVsActual = {
  sessionId: string;
  activityId: string;
  durationDeltaMinutes?: number;
  durationDeltaPercent?: number;
  distanceDeltaMeters?: number;
  distanceDeltaPercent?: number;
  paceDeltaSecondsPerKm?: number;
  elevationDeltaMeters?: number;
  adherence: "unknown" | "partial" | "on_target" | "over";
  observations: string[];
};

export type WeeklyTrainingMetrics = {
  weekStart: ISODate;
  weekEnd: ISODate;
  plannedSessions: number;
  completedSessions: number;
  skippedSessions: number;
  modifiedSessions: number;
  plannedMinutes: number;
  actualMinutes: number;
  plannedDistanceKm: number;
  actualDistanceKm: number;
  plannedElevationMeters: number;
  actualElevationMeters: number;
  adherencePercent?: number;
  averageRpe?: number;
  totalPlannedCost: number;
};

export type PerformanceObservation = {
  id: string;
  sessionId: string;
  date: ISODate;
  rpe?: number;
  paceEfficiency?: number;
  durationMinutes?: number;
  precededByHighLowerBodyLoad48h?: boolean;
};

export type AthleteInsight = {
  id: string;
  kind: "adherence" | "load" | "recovery" | "performance" | "data_quality";
  title: string;
  message: string;
  action?: string;
  confidence: "low" | "medium" | "high";
  dataPoints: number;
  insufficientData: boolean;
};

export type AthleteEventType =
  | "5k"
  | "10k"
  | "half_marathon"
  | "marathon"
  | "crossfit_competition"
  | "hyrox"
  | "spartan_sprint"
  | "spartan_super"
  | "spartan_beast"
  | "spartan_weekend"
  | "fell_race"
  | "custom";

export type AthleteEvent = {
  id: string;
  athleteId?: string;
  name: string;
  type: AthleteEventType;
  date: ISODate;
  priority: "A" | "B" | "C";
  location?: string;
  distanceMeters?: number;
  elevationGainMeters?: number;
  goal?: string;
  notes?: string;
};

export type PersonalRecord =
  | {
      id: string;
      kind: "running";
      date: ISODate;
      distance: "1k" | "1_mile" | "5k" | "10k" | "half_marathon";
      timeSeconds: number;
      sourceActivityId?: string;
      notes?: string;
    }
  | {
      id: string;
      kind: "strength";
      date: ISODate;
      movement: string;
      load: number;
      unit: "kg" | "lb";
      reps: number;
      notes?: string;
    }
  | {
      id: string;
      kind: "benchmark";
      date: ISODate;
      name: string;
      score: string;
      timeSeconds?: number;
      notes?: string;
    }
  | {
      id: string;
      kind: "event";
      date: ISODate;
      eventType: AthleteEventType;
      name: string;
      timeSeconds?: number;
      placing?: number;
      notes?: string;
    };

export type RunSessionFamily =
  | "easy"
  | "recovery"
  | "long"
  | "strides"
  | "threshold"
  | "tempo"
  | "vo2"
  | "hill_reps"
  | "race_specific"
  | "fell_trail"
  | "benchmark"
  | "taper";

export type HybridCommitment = {
  dayOfWeek: number;
  name: string;
  lowerBodyLoad: "low" | "moderate" | "high";
  fixed?: boolean;
};

export type ConservativeRunPlanInput = {
  startDate: ISODate;
  targetDate: ISODate;
  targetEventType: AthleteEventType;
  targetDistanceKm?: number;
  targetElevationMeters?: number;
  targetTimeSeconds?: number;
  runningDaysPerWeek: number;
  preferredLongRunDay: number;
  restDays: number[];
  maximumWeeklyTrainingDays: number;
  currentWeeklyDistanceKm: number;
  currentWeeklyElevationMeters: number;
  recentWeeklyDistanceKm?: number[];
  recentWeeklyElevationMeters?: number[];
  maximumWeeklyDistanceKm?: number;
  trainingAgeYears?: number;
  current5kSeconds?: number;
  current10kSeconds?: number;
  commitments?: HybridCommitment[];
};

export type PlannedRunSession = {
  id: string;
  family: RunSessionFamily;
  dayOfWeek: number;
  distanceKm: number;
  elevationMeters: number;
  intensity: SessionIntensity;
  rationale: string;
};

export type ConservativeRunPlanWeek = {
  weekNumber: number;
  phase: "base" | "build" | "specific" | "recovery" | "taper";
  startDate: ISODate;
  targetDistanceKm: number;
  targetElevationMeters: number;
  sessions: PlannedRunSession[];
  warnings: string[];
};

export type ConservativeRunPlan = {
  input: ConservativeRunPlanInput;
  weeks: ConservativeRunPlanWeek[];
  guardrails: string[];
  warnings: string[];
};
