// ============================================================
// MemoryCare — Progress Service
// Derives friendly activity trends from stored game sessions.
// Framed as "activity", never as a medical diagnosis.
// ============================================================

import type { DailyProgress, GameSession, ProgressSummary } from '@/types';
import { getOverallLevel } from './gameService';
import { localDateKey } from '@/utils/date';

const dateKey = localDateKey;

/** Mon..Sun labels for the current week window ending today. */
export function last7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

export function buildSummary(sessions: GameSession[]): ProgressSummary {
  const completed = sessions.filter((s) => s.completed);
  const gamesCompleted = completed.length;
  const averageScore =
    completed.length > 0
      ? Math.round(
          completed.reduce((sum, s) => sum + s.score, 0) / completed.length,
        )
      : 0;

  // Weekly buckets
  const days = last7Days();
  const weekly: DailyProgress[] = days.map((d) => {
    const key = dateKey(d);
    const daySessions = completed.filter(
      (s) => dateKey(new Date(s.timestamp)) === key,
    );
    const avg =
      daySessions.length > 0
        ? Math.round(
            daySessions.reduce((sum, s) => sum + s.score, 0) /
              daySessions.length,
          )
        : 0;
    return {
      date: key,
      gamesCompleted: daySessions.length,
      averageScore: avg,
      minutesActive: Math.round(
        daySessions.reduce((sum, s) => sum + s.durationSec, 0) / 60,
      ),
    };
  });

  const daysPlayedThisWeek = weekly.filter((d) => d.gamesCompleted > 0).length;
  const streakDays = computeStreak(completed);

  return {
    gamesCompleted,
    averageScore,
    currentLevel: getOverallLevel(),
    streakDays,
    weekly,
    daysPlayedThisWeek,
  };
}

/** Consecutive days (ending today or yesterday) with at least one game. */
function computeStreak(sessions: GameSession[]): number {
  if (sessions.length === 0) return 0;
  const played = new Set(
    sessions.map((s) => dateKey(new Date(s.timestamp))),
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // Allow the streak to count from today or yesterday.
  if (!played.has(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!played.has(dateKey(cursor))) return 0;
  }
  while (played.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Short weekday initials, aligned to last7Days(). */
export function weekdayInitials(): string[] {
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return last7Days().map((d) => names[d.getDay()]);
}
