import type { Programme, Workout } from "./types";

const gripAndGas: Workout = {
  id: "grip-and-gas",
  title: "Grip & Gas",
  category: "hybrid",
  durationMinutes: 48,
  intensity: "hard",
  focus: ["grip", "engine", "hinge"],
  equipment: ["kettlebell", "pull-up bar", "rower"],
  coachNotes: "Keep transitions sharp but protect your grip. Break early before the forearms redline.",
  substitutions: ["Swap toes-to-bar for hanging knee raises", "Swap rower for 400m run"],
  blocks: [
    {
      name: "Raise Temperature",
      type: "warmup",
      durationMinutes: 10,
      items: ["5 min easy row", "2 rounds: 10 kettlebell deadlifts, 8 scap pull-ups, 8 inchworms"],
    },
    {
      name: "Grip Primer",
      type: "skill",
      durationMinutes: 8,
      items: ["4 sets: 20 sec active hang + 8 Russian kettlebell swings", "Rest 45 sec between sets"],
    },
    {
      name: "Main Piece",
      type: "conditioning",
      durationMinutes: 22,
      items: ["5 rounds for time", "400m row", "18 kettlebell swings", "12 toes-to-bar"],
    },
    {
      name: "Flush",
      type: "cooldown",
      durationMinutes: 8,
      items: ["Easy bike or walk", "Forearm, lat, and hip flexor stretch"],
    },
  ],
};

const upperStrengthHandstand: Workout = {
  id: "upper-strength-handstand",
  title: "Upper Strength + Handstand",
  category: "strength",
  durationMinutes: 60,
  intensity: "moderate",
  focus: ["press", "shoulder stability", "inversion"],
  equipment: ["barbell", "dumbbells", "wall"],
  coachNotes: "Move heavy enough to respect the lift, not so heavy that the handstand line falls apart.",
  substitutions: ["Use seated dumbbell press if the back is tired", "Use box pike holds for handstand volume"],
  blocks: [
    {
      name: "Prep",
      type: "warmup",
      durationMinutes: 10,
      items: ["Band shoulder series", "3 rounds: 8 push-ups, 10 hollow rocks, 20 sec wall-facing plank"],
    },
    {
      name: "Strict Press",
      type: "strength",
      durationMinutes: 22,
      items: ["5 sets x 5 reps strict press", "Build to RPE 7", "Superset with 8 chest-supported rows"],
    },
    {
      name: "Handstand Line",
      type: "skill",
      durationMinutes: 14,
      items: ["6 sets: 25 sec wall-facing handstand hold", "After each hold: 8 slow shoulder taps"],
    },
    {
      name: "Accessory Armor",
      type: "accessory",
      durationMinutes: 14,
      items: ["3 rounds: 12 dumbbell incline press", "15 band pull-aparts", "10 strict hanging knee raises"],
    },
  ],
};

const trackEightByFourHundred: Workout = {
  id: "track-8x400",
  title: "Track 8 x 400m",
  category: "track",
  durationMinutes: 50,
  intensity: "hard",
  focus: ["speed endurance", "pacing", "run economy"],
  equipment: ["track", "timer"],
  coachNotes: "Aim for controlled aggression. First two reps should feel almost too smooth.",
  substitutions: ["Run 8 x 90 sec on road if no track is available", "Use 8 x 500m row at hard aerobic effort"],
  blocks: [
    {
      name: "Run Prep",
      type: "warmup",
      durationMinutes: 15,
      items: ["800m easy jog", "Dynamic drills: A-skips, high knees, butt kicks", "4 x 80m strides building pace"],
    },
    {
      name: "Intervals",
      type: "intervals",
      durationMinutes: 25,
      items: ["8 x 400m at strong repeatable pace", "Rest 90 sec walk or standing recovery", "Hold final rep within 3 sec of first rep"],
    },
    {
      name: "Downshift",
      type: "cooldown",
      durationMinutes: 10,
      items: ["600m easy jog", "Calf, quad, and hip mobility"],
    },
  ],
};

const murphBuilder: Workout = {
  id: "murph-builder",
  title: "Murph Builder",
  category: "conditioning",
  durationMinutes: 55,
  intensity: "hard",
  focus: ["pull-ups", "push-ups", "run durability"],
  equipment: ["pull-up bar", "vest optional"],
  coachNotes: "Partition before failure. The goal is clean volume and even breathing, not survival reps.",
  substitutions: ["Use ring rows for pull-ups", "Reduce push-ups to sets of 6 if shoulder volume spikes"],
  blocks: [
    {
      name: "Warmup",
      type: "warmup",
      durationMinutes: 10,
      items: ["400m easy run", "2 rounds: 6 ring rows, 8 push-ups, 10 air squats"],
    },
    {
      name: "Volume Builder",
      type: "conditioning",
      durationMinutes: 35,
      items: ["800m run", "10 rounds: 5 pull-ups, 10 push-ups, 15 air squats", "800m run"],
    },
    {
      name: "Cooldown",
      type: "cooldown",
      durationMinutes: 10,
      items: ["Easy walk until nasal breathing returns", "Pec and lat stretch"],
    },
  ],
};

const lowerStrengthSled: Workout = {
  id: "lower-strength-sled",
  title: "Lower Strength + Sled",
  category: "strength",
  durationMinutes: 58,
  intensity: "moderate",
  focus: ["squat", "posterior chain", "leg drive"],
  equipment: ["barbell", "sled", "plates"],
  coachNotes: "Own the squat positions, then push the sled like acceleration work, not a slow grind.",
  substitutions: ["Swap sled pushes for heavy bike sprints", "Use front squat if back squat setup is limited"],
  blocks: [
    {
      name: "Lower Prep",
      type: "warmup",
      durationMinutes: 12,
      items: ["5 min bike", "3 rounds: 8 goblet squats, 8 cossack squats, 12 glute bridges"],
    },
    {
      name: "Back Squat",
      type: "strength",
      durationMinutes: 24,
      items: ["6 sets x 3 reps back squat", "Build to RPE 8 with full speed out of the hole"],
    },
    {
      name: "Sled Push",
      type: "conditioning",
      durationMinutes: 12,
      items: ["8 x 20m heavy sled push", "Walk back recovery"],
    },
    {
      name: "Trunk Finish",
      type: "accessory",
      durationMinutes: 10,
      items: ["3 rounds: 40m suitcase carry each side", "12 reverse lunges"],
    },
  ],
};

const barMuscleUpEmom: Workout = {
  id: "bar-muscle-up-emom-12",
  title: "Bar Muscle-Up EMOM 12",
  category: "gymnastics",
  durationMinutes: 42,
  intensity: "moderate",
  focus: ["pulling power", "turnover", "skill density"],
  equipment: ["pull-up bar", "box", "band"],
  coachNotes: "Choose the hardest variation that stays crisp. Missed reps do not help the skill.",
  substitutions: ["Use jumping bar muscle-ups", "Use chest-to-bar pull-ups plus low-bar transitions"],
  blocks: [
    {
      name: "Shoulder Prep",
      type: "warmup",
      durationMinutes: 10,
      items: ["Band lat opener", "3 rounds: 8 scap pull-ups, 8 kip swings, 6 hollow-to-arch snaps"],
    },
    {
      name: "Turnover Skill",
      type: "skill",
      durationMinutes: 12,
      items: ["5 sets: 3 low-bar transition drills", "5 sets: 2 jumping bar muscle-ups with slow negative"],
    },
    {
      name: "EMOM 12",
      type: "skill",
      durationMinutes: 12,
      items: ["Minute 1: 1-3 bar muscle-ups or best progression", "Minute 2: 8 hollow rocks", "Repeat for 12 minutes"],
    },
    {
      name: "Pulling Accessory",
      type: "accessory",
      durationMinutes: 8,
      items: ["3 sets: 8 strict pull-ups or ring rows", "12 banded face pulls"],
    },
  ],
};

const zoneTwoReload: Workout = {
  id: "zone-2-reload",
  title: "Zone 2 Reload",
  category: "recovery",
  durationMinutes: 38,
  intensity: "easy",
  focus: ["aerobic base", "nasal breathing", "mobility"],
  equipment: ["bike", "mat"],
  coachNotes: "Leave fresher than you arrived. Keep breathing under control the whole way.",
  substitutions: ["Use rower, incline walk, or easy jog", "Cap heart rate at conversational effort"],
  blocks: [
    {
      name: "Easy Engine",
      type: "conditioning",
      durationMinutes: 28,
      items: ["Bike, row, or jog at conversational pace", "Nasal breathing only if possible"],
    },
    {
      name: "Mobility Reset",
      type: "cooldown",
      durationMinutes: 10,
      items: ["90/90 hip switches", "Couch stretch", "Thoracic open books"],
    },
  ],
};

const saturdayHybrid: Workout = {
  id: "saturday-hybrid",
  title: "Saturday Hybrid",
  category: "hybrid",
  durationMinutes: 70,
  intensity: "hard",
  focus: ["mixed modal", "compromised running", "grip"],
  equipment: ["rower", "dumbbells", "sandbag", "pull-up bar"],
  coachNotes: "This is the weekly test piece. Pace the first half like you expect a second workout.",
  substitutions: ["Swap sandbag cleans for power cleans", "Scale pull-ups to ring rows or jumping pull-ups"],
  blocks: [
    {
      name: "Full-System Warmup",
      type: "warmup",
      durationMinutes: 12,
      items: ["6 min easy row", "2 rounds: 10 air squats, 8 dumbbell snatches, 6 burpees"],
    },
    {
      name: "Primer",
      type: "skill",
      durationMinutes: 8,
      items: ["3 rounds smooth: 6 sandbag cleans, 8 pull-ups, 100m run"],
    },
    {
      name: "Saturday Piece",
      type: "conditioning",
      durationMinutes: 40,
      items: ["For time", "1000m row", "50 dumbbell box step-overs", "40 sandbag cleans", "30 pull-ups", "20 burpees over dumbbell", "1000m run"],
    },
    {
      name: "Cooldown",
      type: "cooldown",
      durationMinutes: 10,
      items: ["Walk 5 min", "Long exhale breathing and hip opener"],
    },
  ],
};

const deadliftEngine: Workout = {
  id: "deadlift-engine",
  title: "Deadlift Engine",
  category: "strength",
  durationMinutes: 56,
  intensity: "moderate",
  focus: ["deadlift", "posterior chain", "midline"],
  equipment: ["barbell", "bike", "dumbbells"],
  coachNotes: "Pull with discipline, then keep the bike uncomfortable but repeatable.",
  substitutions: ["Use trap bar deadlift", "Swap bike calories for 250m row"],
  blocks: [
    { name: "Hinge Prep", type: "warmup", durationMinutes: 10, items: ["3 rounds: 10 good mornings, 10 dead bugs, 8 tempo kettlebell deadlifts"] },
    { name: "Deadlift", type: "strength", durationMinutes: 24, items: ["5 sets x 4 reps deadlift at RPE 7-8", "Rest 2 min between sets"] },
    { name: "Engine Superset", type: "conditioning", durationMinutes: 14, items: ["6 rounds", "10 dumbbell front rack reverse lunges", "12/10 bike calories"] },
    { name: "Reset", type: "cooldown", durationMinutes: 8, items: ["Hamstring floss", "90 sec per side pigeon stretch"] },
  ],
};

const thresholdFiveKs: Workout = {
  id: "threshold-5k-blocks",
  title: "Threshold 5K Blocks",
  category: "track",
  durationMinutes: 52,
  intensity: "moderate",
  focus: ["threshold", "cadence", "control"],
  equipment: ["road or track", "timer"],
  coachNotes: "Run just under the red line. You should finish knowing you had one more rep.",
  substitutions: ["Use treadmill at 1 percent incline", "Use 4 x 5 min bike threshold if running is not available"],
  blocks: [
    { name: "Warmup", type: "warmup", durationMinutes: 12, items: ["10 min easy jog", "4 x 20 sec strides"] },
    { name: "Threshold Blocks", type: "intervals", durationMinutes: 30, items: ["4 x 5 min at threshold pace", "2 min easy jog between reps"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 10, items: ["Easy jog", "Calves and hip flexors"] },
  ],
};

const handstandPullVolume: Workout = {
  id: "handstand-pull-volume",
  title: "Handstand Pull Volume",
  category: "gymnastics",
  durationMinutes: 46,
  intensity: "moderate",
  focus: ["handstand", "strict pull", "core"],
  equipment: ["wall", "pull-up bar", "rings"],
  coachNotes: "Quality positions win here. Stop sets before elbows or midline get sloppy.",
  substitutions: ["Use box handstand holds", "Use ring rows if strict pull-ups are below 5 reps"],
  blocks: [
    { name: "Prep", type: "warmup", durationMinutes: 9, items: ["Wrist series", "2 rounds: 10 scap push-ups, 8 kip swings, 20 sec hollow hold"] },
    { name: "Skill Density", type: "skill", durationMinutes: 18, items: ["Every 90 sec x 8: 20 sec handstand hold + 4 strict pull-ups"] },
    { name: "Accessory", type: "accessory", durationMinutes: 12, items: ["3 rounds: 8 deficit push-ups, 12 ring rows, 20 sec L-sit tuck"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 7, items: ["Forearm stretch", "Lat opener"] },
  ],
};

const recoveryCarry: Workout = {
  id: "recovery-carry",
  title: "Recovery Carry",
  category: "recovery",
  durationMinutes: 40,
  intensity: "easy",
  focus: ["loaded carry", "breathing", "mobility"],
  equipment: ["kettlebells", "mat"],
  coachNotes: "Keep this calm. Carries should wake the trunk up, not drain the legs.",
  substitutions: ["Use suitcase holds if space is limited", "Use incline walk instead of carries"],
  blocks: [
    { name: "Easy Aerobic", type: "conditioning", durationMinutes: 20, items: ["20 min brisk walk or easy bike", "Nasal breathing only"] },
    { name: "Carry Flow", type: "accessory", durationMinutes: 12, items: ["6 rounds: 40m suitcase carry each side", "Rest as needed"] },
    { name: "Mobility", type: "cooldown", durationMinutes: 8, items: ["Couch stretch", "T-spine rotations", "Box breathing"] },
  ],
};

const frontSquatRun: Workout = {
  id: "front-squat-run",
  title: "Front Squat + Run",
  category: "hybrid",
  durationMinutes: 62,
  intensity: "hard",
  focus: ["front squat", "running under fatigue", "bracing"],
  equipment: ["barbell", "track or road"],
  coachNotes: "Choose a load you never need to stare at. Runs should stay honest after squats.",
  substitutions: ["Use goblet squats if no rack", "Swap 300m run for 75 sec hard bike"],
  blocks: [
    { name: "Warmup", type: "warmup", durationMinutes: 12, items: ["8 min easy jog", "2 rounds: 8 front rack lunges, 8 air squats, 8 burpees"] },
    { name: "Squat Primer", type: "strength", durationMinutes: 14, items: ["Front squat 4 x 3 at RPE 7", "Fast stand every rep"] },
    { name: "Mixed Piece", type: "conditioning", durationMinutes: 28, items: ["5 rounds for time", "9 front squats", "300m run"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 8, items: ["Walk until breathing settles", "Quad and lat stretch"] },
  ],
};

const mileRepeats: Workout = {
  id: "mile-repeat-control",
  title: "Mile Repeat Control",
  category: "track",
  durationMinutes: 58,
  intensity: "hard",
  focus: ["aerobic power", "pacing", "mental control"],
  equipment: ["track or flat route", "timer"],
  coachNotes: "Reps two and three matter most. Hold posture when pace pressure arrives.",
  substitutions: ["Run 3 x 7 min if route distance is unknown", "Use 3 x 2k row at threshold effort"],
  blocks: [
    { name: "Warmup", type: "warmup", durationMinutes: 15, items: ["1 mile easy", "Drills and 4 x 100m strides"] },
    { name: "Main Set", type: "intervals", durationMinutes: 33, items: ["3 x 1 mile at 10K effort", "3 min walk or jog recovery"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 10, items: ["Easy jog", "Hip and calf mobility"] },
  ],
};

const ringStrength: Workout = {
  id: "ring-strength",
  title: "Ring Strength",
  category: "gymnastics",
  durationMinutes: 44,
  intensity: "moderate",
  focus: ["rings", "strict strength", "position"],
  equipment: ["rings", "box", "band"],
  coachNotes: "Smooth tempo beats shaky reps. Keep shoulders packed on every support hold.",
  substitutions: ["Use parallel bars for dips", "Use band assistance on ring dips"],
  blocks: [
    { name: "Prep", type: "warmup", durationMinutes: 10, items: ["Ring support practice", "2 rounds: 8 ring rows, 8 push-ups, 20 sec hollow hold"] },
    { name: "Strict Work", type: "strength", durationMinutes: 20, items: ["5 sets: 5 ring dips or progression", "Superset with 6 strict pull-ups"] },
    { name: "Skill Finish", type: "skill", durationMinutes: 8, items: ["6 sets: 12 sec false grip hang", "3 slow ring transitions"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 6, items: ["Pec stretch", "Forearm opener"] },
  ],
};

const engineRetest: Workout = {
  id: "engine-retest",
  title: "Engine Retest",
  category: "hybrid",
  durationMinutes: 64,
  intensity: "hard",
  focus: ["benchmark", "engine", "repeatability"],
  equipment: ["rower", "dumbbells", "pull-up bar"],
  coachNotes: "This closes the block. Stay smooth through the middle and attack the final row.",
  substitutions: ["Use run or bike for row calories", "Scale pull-ups to jumping pull-ups or ring rows"],
  blocks: [
    { name: "Warmup", type: "warmup", durationMinutes: 12, items: ["5 min row", "2 rounds: 10 air squats, 8 dumbbell deadlifts, 6 pull-ups"] },
    { name: "Primer", type: "skill", durationMinutes: 8, items: ["3 rounds easy: 8 dumbbell snatches, 6 burpees, 6 pull-ups"] },
    { name: "Retest", type: "conditioning", durationMinutes: 34, items: ["3 rounds for time", "500m row", "21 dumbbell snatches", "15 burpees", "9 pull-ups"] },
    { name: "Cooldown", type: "cooldown", durationMinutes: 10, items: ["Walk 5 min", "Lat, calf, and hip reset"] },
  ],
};

export const sampleProgramme: Programme = {
  id: "hybrid-engine-build",
  name: "Hybrid Engine Build",
  description:
    "Four weeks of strength, track work, gymnastics skill, recovery, and mixed-modal conditioning for a stronger private training engine.",
  durationWeeks: 4,
  startDate: null,
  weeks: [
    {
      id: "week-1",
      weekNumber: 1,
      title: "Base Pressure",
      days: [
        { id: "w1d1", dayNumber: 1, label: "Day 1", workout: gripAndGas },
        { id: "w1d2", dayNumber: 2, label: "Day 2", workout: upperStrengthHandstand },
        { id: "w1d3", dayNumber: 4, label: "Day 4", workout: trackEightByFourHundred },
        { id: "w1d4", dayNumber: 6, label: "Day 6", workout: murphBuilder },
      ],
    },
    {
      id: "week-2",
      weekNumber: 2,
      title: "Capacity Lock-In",
      days: [
        { id: "w2d1", dayNumber: 1, label: "Day 1", workout: lowerStrengthSled },
        { id: "w2d2", dayNumber: 3, label: "Day 3", workout: barMuscleUpEmom },
        { id: "w2d3", dayNumber: 5, label: "Day 5", workout: zoneTwoReload },
        { id: "w2d4", dayNumber: 6, label: "Saturday", workout: saturdayHybrid },
      ],
    },
    {
      id: "week-3",
      weekNumber: 3,
      title: "Threshold Build",
      days: [
        { id: "w3d1", dayNumber: 1, label: "Day 1", workout: deadliftEngine },
        { id: "w3d2", dayNumber: 3, label: "Day 3", workout: thresholdFiveKs },
        { id: "w3d3", dayNumber: 5, label: "Day 5", workout: handstandPullVolume },
        { id: "w3d4", dayNumber: 6, label: "Saturday", workout: recoveryCarry },
      ],
    },
    {
      id: "week-4",
      weekNumber: 4,
      title: "Retest Week",
      days: [
        { id: "w4d1", dayNumber: 1, label: "Day 1", workout: frontSquatRun },
        { id: "w4d2", dayNumber: 3, label: "Day 3", workout: mileRepeats },
        { id: "w4d3", dayNumber: 5, label: "Day 5", workout: ringStrength },
        { id: "w4d4", dayNumber: 6, label: "Saturday", workout: engineRetest },
      ],
    },
  ],
};
