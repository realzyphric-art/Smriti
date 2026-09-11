import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/types';
import { buildWeeklyReportStats } from '@/services/reportService';

function session(daysAgo: number, accuracy: number, durationSec: number): GameSession {
  const timestamp = new Date('2026-09-11T12:00:00').getTime() - daysAgo * 86_400_000;
  return {
    id: `session-${daysAgo}-${accuracy}`,
    patientId: 'patient-1',
    gameType: 'picture-pairs',
    level: 2,
    score: accuracy,
    accuracy,
    attempts: 4,
    completed: true,
    durationSec,
    timestamp,
    synced: true,
  };
}

describe('buildWeeklyReportStats', () => {
  it('compares the latest seven days with the preceding seven days', () => {
    const stats = buildWeeklyReportStats([
      session(0, 90, 40),
      session(2, 80, 50),
      session(7, 60, 70),
      session(9, 70, 60),
    ], new Date('2026-09-11T18:00:00'));

    expect(stats.current.completed).toBe(2);
    expect(stats.current.activeDays).toBe(2);
    expect(stats.current.accuracy).toBe(85);
    expect(stats.previous.accuracy).toBe(65);
    expect(stats.accuracyDelta).toBe(20);
    expect(stats.responseDelta).toBe(-20);
    expect(stats.engagementDelta).toBe(0);
  });

  it('does not claim a trend without prior-week sessions', () => {
    const stats = buildWeeklyReportStats([session(0, 75, 55)], new Date('2026-09-11T18:00:00'));
    expect(stats.accuracyDelta).toBeNull();
    expect(stats.responseDelta).toBeNull();
    expect(stats.engagementDelta).toBeNull();
  });
});
