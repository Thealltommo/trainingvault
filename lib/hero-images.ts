import type { Workout, WorkoutCategory } from "./types";

const HERO_IMAGE_POOLS: Record<WorkoutCategory, readonly string[]> = {
  track: ["/assets/hero1.png", "/assets/hero5.png"],
  strength: ["/assets/hero2.png", "/assets/hero10.png"],
  gymnastics: ["/assets/hero3.png", "/assets/hero7.png"],
  hybrid: ["/assets/hero4.png", "/assets/hero8.png", "/assets/hero9.png"],
  conditioning: ["/assets/hero4.png", "/assets/hero6.png", "/assets/hero8.png", "/assets/hero9.png"],
  recovery: ["/assets/hero5.png", "/assets/hero1.png"],
};

export const HERO_IMAGES = {
  home: "/assets/hero1.png",
  fallback: "/assets/hero1.png",
  pools: HERO_IMAGE_POOLS,
} as const;

function normalizeHeroCategory(category?: string | null): WorkoutCategory | null {
  const value = category?.toLowerCase().trim();

  if (!value) {
    return null;
  }

  if (value in HERO_IMAGE_POOLS) {
    return value as WorkoutCategory;
  }

  if (value.includes("rest") || value.includes("recovery")) {
    return "recovery";
  }

  if (value.includes("run") || value.includes("track") || value.includes("interval")) {
    return "track";
  }

  if (value.includes("skill") || value.includes("gymnastics") || value.includes("handstand") || value.includes("muscle")) {
    return "gymnastics";
  }

  if (value.includes("strength") || value.includes("oly") || value.includes("barbell") || value.includes("lift")) {
    return "strength";
  }

  if (value.includes("hybrid") || value.includes("comp") || value.includes("murph")) {
    return "hybrid";
  }

  if (value.includes("conditioning") || value.includes("engine") || value.includes("metcon")) {
    return "conditioning";
  }

  return null;
}

function hashString(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return hash >>> 0;
}

export function getHeroImage(category?: string | null): string {
  const normalizedCategory = normalizeHeroCategory(category);

  if (!normalizedCategory) {
    return HERO_IMAGES.fallback;
  }

  return HERO_IMAGES.pools[normalizedCategory][0] ?? HERO_IMAGES.fallback;
}

export function getHeroImageForWorkout(workout: Workout, index?: number): string {
  const normalizedCategory = normalizeHeroCategory(workout.category ?? workout.sessionType);
  const pool = normalizedCategory ? HERO_IMAGES.pools[normalizedCategory] : null;

  if (!pool || pool.length === 0) {
    return HERO_IMAGES.fallback;
  }

  const seed = workout.id || workout.title || (typeof index === "number" ? String(index) : "");
  const hash = seed ? hashString(seed) : Math.max(index ?? 0, 0);

  return pool[hash % pool.length] ?? HERO_IMAGES.fallback;
}
