const NO_LIMITER_LOGGED_LABEL = "No limiter logged";

export function normalizeLimiter(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();

  if (!normalized || normalized.toLowerCase() === NO_LIMITER_LOGGED_LABEL.toLowerCase()) {
    return undefined;
  }

  return normalized;
}
