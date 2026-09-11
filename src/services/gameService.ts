// ============================================================
// MemoryCare — Game Service
// Reusable adaptive scoring engine + per-game difficulty config.
// The adaptive rules are the core SIH concept:
//   score >= 80  -> level up
//   50 <= score < 80 -> same level
//   score < 50  -> level down
// This logic lives here ONCE and is reused by every game.
// ============================================================

import type { CognitiveCategory, GameSession, GameType, LevelMap, StandardGameSession } from '@/types';
import { storageService } from './storageService';
import { supabase } from '@/lib/supabase';
import { isGuestPatientId } from './guestService';
import { touchPatientSync } from './sharingService';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
const LEVEL_KEY = 'mc:levels';

/** The single source of truth for adaptive difficulty. */
export function calculateNextLevel(
  score: number,
  currentLevel: number,
): { level: number; change: 'up' | 'same' | 'down' } {
  if (score >= 80) {
    const level = Math.min(MAX_LEVEL, currentLevel + 1);
    return { level, change: level > currentLevel ? 'up' : 'same' };
  }
  if (score < 50) {
    const level = Math.max(MIN_LEVEL, currentLevel - 1);
    return { level, change: level < currentLevel ? 'down' : 'same' };
  }
  return { level: currentLevel, change: 'same' };
}

/** Accuracy as a rounded 0–100 percentage. Guards against divide-by-zero. */
export function computeAccuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

// ---------- Per-game level configuration ----------

export interface PairsConfig {
  pairs: number;
  previewMs: number;
}
export interface PatternConfig {
  length: number;
  buttons: number;
  displayMs: number;
}
export interface RoutineConfig {
  steps: number;
}

export function pairsConfig(level: number): PairsConfig {
  // 3 -> 6 pairs, gentle preview that shortens slightly with level
  const pairs = Math.min(6, 2 + level); // L1:3 L2:4 L3:5 L4:6 L5:6
  const previewMs = Math.max(1200, 3000 - (level - 1) * 400);
  return { pairs, previewMs };
}

export function patternConfig(level: number): PatternConfig {
  const length = Math.min(6, 2 + level); // L1:3 .. L4+:6
  const buttons = level >= 4 ? 6 : 4;
  const displayMs = Math.max(600, 1000 - (level - 1) * 90);
  return { length, buttons, displayMs };
}

export function routineConfig(level: number): RoutineConfig {
  const steps = Math.min(6, 3 + Math.floor((level - 1) / 1)); // L1:3 L2:4 ...
  return { steps: Math.min(6, steps) };
}

// ---------- Level map persistence ----------

const DEFAULT_LEVELS: LevelMap = { 'picture-pairs': 1, 'pattern-recall': 1, 'daily-routine': 1, 'who-is-this-person': 1 };

export const GAME_DEFINITIONS: Record<GameType, { slug: string; category: CognitiveCategory; title: string }> = {
  'picture-pairs': { slug: 'picture-pairs', category: 'Memory', title: 'Picture Pairs' },
  'pattern-recall': { slug: 'follow-the-sequence', category: 'Sequence', title: 'Follow the Sequence' },
  'daily-routine': { slug: 'daily-routine-ordering', category: 'Daily Routine', title: 'Daily Routine Ordering' },
  'who-is-this-person': { slug: 'who-is-this-person', category: 'Memory', title: 'Who Is This Person?' },
};

export function getLevels(): LevelMap {
  return storageService.get<LevelMap>(LEVEL_KEY, DEFAULT_LEVELS);
}

export function getLevel(game: GameType): number {
  return getLevels()[game] ?? 1;
}

export function setLevel(game: GameType, level: number): void {
  const levels = getLevels();
  levels[game] = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, level));
  storageService.set(LEVEL_KEY, levels);
}

/** Overall level = highest active game level (for the "Current Level" chip). */
export function getOverallLevel(): number {
  const levels = getLevels();
  return Math.max(...Object.values(levels));
}

// ---------- Session recording ----------

export async function recordSession(
  input: Omit<GameSession, 'id' | 'timestamp' | 'synced'>,
): Promise<GameSession> {
  const session: GameSession = {
    ...input,
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    synced: false,
  };
  await storageService.putSession(session);
  return session;
}

/** A shared persistence path for every game; cloud first, local fallback. */
export async function recordStandardSession(input: Omit<StandardGameSession, 'id' | 'timestamp'>): Promise<StandardGameSession> {
  const session: StandardGameSession = { ...input, id: crypto.randomUUID(), timestamp: Date.now() };
  const legacy: Omit<GameSession, 'id' | 'timestamp' | 'synced'> = {
    patientId: input.patientId, gameType: input.gameType, level: input.difficulty, score: input.score,
    accuracy: input.accuracy, attempts: input.attempts, completed: input.completed,
    durationSec: Math.round(input.responseTimeMs / 1000), category: input.category,
    difficulty: input.difficulty, mistakes: input.mistakes, responseTimeMs: input.responseTimeMs,
    metrics: input.metrics,
  };
  const localSession = await recordSession(legacy);
  if (!supabase || isGuestPatientId(input.patientId)) return session;
  try {
    const game = GAME_DEFINITIONS[input.gameType];
    const { data: gameRow, error: gameError } = await supabase.from('games').select('id').eq('slug', game.slug).single();
    if (gameError) throw gameError;
    const { data, error } = await supabase.from('game_sessions').upsert({
      patient_id: input.patientId, game_id: gameRow.id, game_type: input.gameType, category: input.category,
      level: input.difficulty, score: input.score, accuracy: input.accuracy, attempts: input.attempts,
      mistakes: input.mistakes, response_time_ms: input.responseTimeMs, completed: input.completed,
      duration_seconds: Math.round(input.responseTimeMs / 1000), client_id: localSession.id,
    }, { onConflict: 'patient_id,client_id' }).select('id').single();
    if (error) throw error;
    const metrics = Object.entries(input.metrics).map(([metric_name, value]) => ({ session_id: data.id, metric_name, metric_value: typeof value === 'number' ? value : 0, metric_text: typeof value === 'string' ? value : null }));
    if (metrics.length) { const { error: metricsError } = await supabase.from('game_metrics').upsert(metrics, { onConflict: 'session_id,metric_name' }); if (metricsError) throw metricsError; }
    await storageService.putSession({ ...localSession, synced: true });
    await touchPatientSync(input.patientId).catch(() => undefined);
  } catch {
    // The local copy is the source of truth until connectivity/auth is restored.
  }
  return session;
}

export function calculateAdaptiveLevel(score: number, responseTimeMs: number, recentScores: number[], currentLevel: number) {
  const average = recentScores.length ? recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length : score;
  const consistent = recentScores.length < 3 || Math.max(...recentScores, score) - Math.min(...recentScores, score) <= 25;
  const adjusted = score >= 80 && average >= 75 && consistent && responseTimeMs < 120000 ? score : score < 50 ? score : 65;
  return calculateNextLevel(adjusted, currentLevel);
}
