import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { GameResultData, GameType } from '@/types';
import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { getLevel, setLevel } from '@/services/gameService';
import type { GameOutcome } from '@/utils/helpers';
import { AppHeader } from '@/components/AppHeader';
import { VoiceButton } from '@/components/VoiceButton';
import { GameResult } from '@/components/GameResult';
import { PicturePairs } from '@/games/PicturePairs';
import { PatternRecall } from '@/games/PatternRecall';
import { DailyRoutine } from '@/games/DailyRoutine';
import { WhoIsThisPerson } from '@/games/WhoIsThisPerson';
import { calculateAdaptiveLevel, GAME_DEFINITIONS, recordStandardSession } from '@/services/gameService';
import { isGuestPatientId } from '@/services/guestService';
import { supabase } from '@/lib/supabase';

const VALID: GameType[] = ['picture-pairs', 'pattern-recall', 'daily-routine', 'who-is-this-person'];

const TITLE_KEY: Record<GameType, string> = {
  'picture-pairs': 'pairs.title',
  'pattern-recall': 'pattern.title',
  'daily-routine': 'routine.title',
  'who-is-this-person': 'familiar.title',
};

const INSTRUCTION_KEY: Record<GameType, string> = {
  'picture-pairs': 'pairs.instruction',
  'pattern-recall': 'pattern.watchInstruction',
  'daily-routine': 'routine.instruction',
  'who-is-this-person': 'familiar.question',
};

export function GamePlay() {
  const { gameId } = useParams<{ gameId: string }>();
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [view, setView] = useState<'playing' | 'result'>('playing');
  const [result, setResult] = useState<GameResultData | null>(null);
  const [replayKey, setReplayKey] = useState(0);

  if (!gameId || !VALID.includes(gameId as GameType)) {
    return <Navigate to="/games" replace />;
  }
  const gameType = gameId as GameType;
  const level = getLevel(gameType);

  const handleComplete = async (outcome: GameOutcome) => {
    const previousLevel = getLevel(gameType);
    const patientId = settings.activePatientId ?? 'unassigned';
    const recentScores = supabase && patientId !== 'unassigned' && !isGuestPatientId(patientId) ? ((await supabase.from('game_sessions').select('score').eq('patient_id', patientId).eq('game_type', gameType).order('played_at', { ascending: false }).limit(3)).data ?? []).map((entry) => entry.score) : [];
    const { level: newLevel, change } = calculateAdaptiveLevel(outcome.score, outcome.responseTimeMs ?? outcome.durationSec * 1000, recentScores, previousLevel);
    await recordStandardSession({ patientId, gameType, category: GAME_DEFINITIONS[gameType].category, difficulty: previousLevel, score: outcome.score, accuracy: outcome.accuracy, attempts: outcome.attempts, mistakes: outcome.mistakes ?? Math.max(0, outcome.attempts - Math.round((outcome.accuracy / 100) * outcome.attempts)), responseTimeMs: outcome.responseTimeMs ?? outcome.durationSec * 1000, completed: true, metrics: outcome.metrics ?? {} });
    if (supabase && patientId !== 'unassigned' && !isGuestPatientId(patientId)) await supabase.from('adaptive_difficulty_history').insert({ patient_id: patientId, game_type: gameType, previous_level: previousLevel, new_level: newLevel, score: outcome.score, response_time_ms: outcome.responseTimeMs ?? outcome.durationSec * 1000, consistency_score: outcome.score });
    setLevel(gameType, newLevel);
    setResult({
      gameType,
      score: outcome.score,
      accuracy: outcome.accuracy,
      attempts: outcome.attempts,
      previousLevel,
      newLevel,
      levelChange: change,
      durationSec: outcome.durationSec,
    });
    setView('result');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const playAgain = () => {
    setResult(null);
    setReplayKey((k) => k + 1);
    setView('playing');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const renderGame = () => {
    const props = { level, onComplete: handleComplete, key: replayKey };
    switch (gameType) {
      case 'picture-pairs':
        return <PicturePairs {...props} />;
      case 'pattern-recall':
        return <PatternRecall {...props} />;
      case 'daily-routine':
        return <DailyRoutine {...props} />;
      case 'who-is-this-person':
        return <WhoIsThisPerson {...props} patientId={settings.activePatientId ?? ''} />;
    }
  };

  return (
    <>
      <AppHeader
        subtitle={`${t('home.level')} ${level}`}
        showBack
        onBack={() => navigate('/games')}
        readText={t(INSTRUCTION_KEY[gameType])}
      />
      <main className="page game-page">
        {view === 'playing' ? (
          <>
            <div className="row-between">
              <h1>{t(TITLE_KEY[gameType])}</h1>
              <VoiceButton text={t(INSTRUCTION_KEY[gameType])} label={t('common.listen')} compact />
            </div>
            {renderGame()}
          </>
        ) : (
          result && (
            <GameResult
              result={result}
              onContinue={() => navigate('/progress')}
              onPlayAgain={playAgain}
              onHome={() => navigate('/home')}
            />
          )
        )}
      </main>
    </>
  );
}
