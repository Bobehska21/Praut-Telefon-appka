export const COUNTDOWN_SECONDS = 30;

/** Sentences are localized in i18n; this is the normalization used to compare. */
export function normalizeSentence(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function isSentenceMatch(typed: string, target: string): boolean {
  return normalizeSentence(typed) === normalizeSentence(target);
}

/** Seconds left before the stop button may proceed, never below zero. */
export function countdownRemaining(startedAt: number, now: number): number {
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.max(0, COUNTDOWN_SECONDS - elapsed);
}
