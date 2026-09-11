export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Greeting key by local hour. */
export function greetingKey(): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const h = new Date().getHours();
  if (h < 12) return 'goodMorning';
  if (h < 17) return 'goodAfternoon';
  return 'goodEvening';
}

/** Shared type used by all games to report their outcome to the host. */
export interface GameOutcome {
  score: number; // 0..100
  accuracy: number; // 0..100
  attempts: number;
  durationSec: number;
  mistakes?: number;
  responseTimeMs?: number;
  metrics?: Record<string, number | string | boolean>;
}
