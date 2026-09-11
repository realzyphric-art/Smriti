import { useCallback, useEffect, useState } from 'react';
import type { GameSession, ProgressSummary } from '@/types';
import { storageService } from '@/services/storageService';
import { buildSummary } from '@/services/progressService';
import { localDateKey } from '@/utils/date';
import { useSettings } from './useSettings';
import { supabase } from '@/lib/supabase';
import { isGuestPatientId } from '@/services/guestService';

function todayKey() {
  return localDateKey();
}

export function useProgressData() {
  const { settings } = useSettings();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
    let list: GameSession[];
    if (supabase && settings.activePatientId && !isGuestPatientId(settings.activePatientId)) {
      try {
        const { data, error } = await supabase.from('game_sessions').select('id, patient_id, game_type, level, score, accuracy, attempts, completed, duration_seconds, played_at').eq('patient_id', settings.activePatientId).order('played_at', { ascending: false });
        if (error) throw error;
        const remote = (data ?? []).map((s) => ({ id: s.id, patientId: s.patient_id, gameType: s.game_type as GameSession['gameType'], level: s.level, score: s.score, accuracy: s.accuracy, attempts: s.attempts, completed: s.completed, durationSec: s.duration_seconds, timestamp: new Date(s.played_at).getTime(), synced: true }));
        const localPending = (await storageService.getSessions()).filter((s) => s.patientId === settings.activePatientId && !s.synced);
        list = [...localPending, ...remote];
      } catch (remoteError) {
        const cached = (await storageService.getSessions()).filter((s) => s.patientId === settings.activePatientId);
        if (!cached.length) throw remoteError;
        list = cached;
      }
    } else {
      list = (await storageService.getSessions()).filter((s) => s.patientId === settings.activePatientId);
    }
    setSessions(list);
    setSummary(buildSummary(list));
    setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity.');
    } finally {
    setLoading(false);
    }
  }, [settings.activePatientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const todayGames = sessions.filter(
    (s) => s.completed && localDateKey(new Date(s.timestamp)) === todayKey(),
  ).length;

  const recentSessions = [...sessions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6);

  return { sessions, summary, todayGames, recentSessions, loading, error, reload };
}
