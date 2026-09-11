import type { GameSession, GameType } from '@/types';
import { storageService } from '@/services/storageService';
import { setLevel } from '@/services/gameService';

const SEED_FLAG = 'mc:demo-seeded';

const GAMES: GameType[] = ['picture-pairs', 'pattern-recall', 'daily-routine'];

// Days ago -> how many sessions + rough score band. Leaves gentle gaps
// so the weekly chart looks natural, not artificially perfect.
const PLAN: Array<{ daysAgo: number; count: number; score: number }> = [
  { daysAgo: 6, count: 1, score: 62 },
  { daysAgo: 5, count: 2, score: 71 },
  { daysAgo: 4, count: 1, score: 68 },
  { daysAgo: 3, count: 2, score: 80 },
  { daysAgo: 1, count: 2, score: 84 },
  { daysAgo: 0, count: 1, score: 88 },
];

function sessionFor(daysAgo: number, idx: number, score: number): GameSession {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9 + idx * 3, 15, 0, 0);
  const gameType = GAMES[(daysAgo + idx) % GAMES.length];
  const jitter = ((daysAgo * 7 + idx * 13) % 9) - 4; // -4..+4
  const s = Math.max(0, Math.min(100, score + jitter));
  return {
    id: `seed-${daysAgo}-${idx}`,
    patientId: 'demo-patient',
    gameType,
    level: s >= 80 ? 3 : 2,
    score: s,
    accuracy: s,
    attempts: 1,
    completed: true,
    durationSec: 120 + idx * 20,
    timestamp: d.getTime(),
    synced: true,
  };
}

/** Seeds a gentle week of activity the first time the app runs, so the
 *  Progress and Family screens are populated for a demo. Runs once. */
export async function seedDemoData(): Promise<void> {
  const existing = await storageService.getSessions();
  if (existing.length === 0 && !storageService.get<boolean>(SEED_FLAG, false)) {
    for (const p of PLAN) {
      for (let i = 0; i < p.count; i++) {
        await storageService.putSession(sessionFor(p.daysAgo, i, p.score));
      }
    }
    // Reflect the adaptive engine's typical starting point.
    setLevel('picture-pairs', 3);
    setLevel('pattern-recall', 2);
    setLevel('daily-routine', 2);
  }

  storageService.set(SEED_FLAG, true);
}
