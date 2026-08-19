export type WorkoutCategory =
  | "strength"
  | "conditioning"
  | "track"
  | "gymnastics"
  | "hybrid"
  | "recovery";

export type WorkoutIntensity = "easy" | "moderate" | "hard";

export type WorkoutPriority = "Low" | "Medium" | "High" | "Recovery" | "Target" | "Primer" | "Optional";

export type WorkoutBlockType =
  | "warmup"
  | "strength"
  | "skill"
  | "conditioning"
  | "intervals"
  | "accessory"
  | "cooldown";

export type ProgrammeGuideItem = {
  title?: string;
  name?: string;
  level?: string;
  description?: string;
  details?: string;
  note?: string;
  items?: string[];
  drills?: string[];
  cues?: string[];
};

export type Programme = {
  id: string;
  name: string;
  description: string;
  durationWeeks: number;
  startDate?: string | null;
  targetEvent?: string;
  targetDate?: string;
  checkpointName?: string;
  checkpointDate?: string;
  trainingSettings?: Record<string, string | number>;
  handstandGuide?: ProgrammeGuideItem[];
  weeks: ProgrammeWeek[];
};

export type ProgrammeWeek = {
  id: string;
  weekNumber: number;
  title: string;
  days: ProgrammeDay[];
};

export type ProgrammeDay = {
  id: string;
  dayNumber: number;
  label: string;
  workout: Workout;
};

export type Workout = {
  id: string;
  title: string;
  category: WorkoutCategory;
  durationMinutes: number;
  intensity: WorkoutIntensity;
  sessionType?: string;
  phase?: string;
  priority?: WorkoutPriority;
  date?: string;
  day?: string;
  minimumMinutes?: number;
  prescribedLoadsOrPace?: string;
  targetStimulus?: string;
  scalingNotes?: string;
  sourceSessionId?: string;
  focus: string[];
  equipment: string[];
  blocks: WorkoutBlock[];
  coachNotes?: string;
  substitutions?: string[];
  alternatives?: string[];
  scaleOptions?: WorkoutScaleOption[];
};

export type WorkoutBlock = {
  name: string;
  type: WorkoutBlockType;
  durationMinutes?: number;
  items: string[];
};

export type WorkoutOverride = {
  workoutId: string;
  date?: string;
  title?: string;
  durationMinutes?: number;
  minimumMinutes?: number;
  intensity?: "easy" | "moderate" | "hard";
  focus?: string[];
  equipment?: string[];
  blocks?: WorkoutBlock[];
  prescribedLoadsOrPace?: string;
  targetStimulus?: string;
  scalingNotes?: string;
  modificationReason?: string;
  updatedAt: string;
};

export type WorkoutScaleOption = {
  id: string;
  label: string;
  type: "scale_down" | "scale_up" | "equipment_swap" | "time_cap" | "fatigue";
  description: string;
  changes?: Partial<Workout>;
};

export type BlockStatus = "todo" | "done" | "skipped";

export type WorkoutBlockProgress = {
  workoutId: string;
  updatedAt: string;
  blocks: Record<string, BlockStatus>;
};

export type BlockResult = {
  blockKey: string;
  blockName: string;
  blockType?: string;
  blockItems?: string[];
  status?: BlockStatus;
  result?: string;
  load?: string;
  reps?: string;
  time?: string;
  calories?: string;
  distance?: string;
  notes?: string;
};

export type SessionLog = {
  id: string;
  workoutId: string;
  workoutTitle: string;
  workoutCategory?: WorkoutCategory;
  workoutSessionType?: string;
  workoutDate?: string;
  workoutModified?: boolean;
  completedAt: string;
  rpe: number;
  actualDurationMinutes?: number;
  distanceKm?: number;
  elevationM?: number;
  averagePaceSecondsPerKm?: number;
  averageHeartRate?: number;
  terrain?: "road" | "track" | "trail" | "fell" | "treadmill" | "mixed";
  score?: string;
  limiter?: string;
  result?: string;
  notes?: string;
  blockResults?: BlockResult[];
};

// Internal names are retained for backwards-compatible snapshots already stored locally or in Supabase.
export type TrainVaultBackup = {
  programme: Programme;
  logs: SessionLog[];
  workoutOverrides: Record<string, WorkoutOverride>;
};

export type TrainVaultSnapshot = {
  version: 1 | 2;
  programme: Programme | null;
  logs: SessionLog[];
  selectedTodayWorkoutId: string | null;
  programmeAnchor: string | null;
  programmeStartDate: string | null;
  blockProgress: Record<string, WorkoutBlockProgress>;
  blockResults: Record<string, Record<string, BlockResult>>;
  workoutOverrides: Record<string, WorkoutOverride>;
  exportedAt: string;
};
