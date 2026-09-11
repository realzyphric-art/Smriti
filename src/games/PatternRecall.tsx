import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { patternConfig } from '@/services/gameService';
import { shuffle, type GameOutcome } from '@/utils/helpers';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';

const TOTAL_ROUNDS = 3;

interface Props {
  level: number;
  onComplete: (o: GameOutcome) => void;
}

type Phase = 'idle' | 'watch' | 'input' | 'feedback' | 'done';

export function PatternRecall({ level, onComplete }: Props) {
  const { t } = useI18n();
  const { say, enabled } = useVoice();
  const cfg = useMemo(() => patternConfig(level), [level]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [sequence, setSequence] = useState<number[]>([]);
  const [litKey, setLitKey] = useState<number | null>(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [lastPress, setLastPress] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'partial' | null>(null);

  const correctTotal = useRef(0);
  const stepsTotal = useRef(0);
  const roundCorrect = useRef(true);
  const startRef = useRef(Date.now());
  const timers = useRef<number[]>([]);

  const keys = Array.from({ length: cfg.buttons }, (_, i) => i + 1);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  const startRound = useCallback(
    (roundIdx: number) => {
      const seq = Array.from(
        { length: cfg.length },
        () => 1 + Math.floor(Math.random() * cfg.buttons),
      );
      // Ensure at least some variety on longer sequences.
      if (cfg.length >= 4 && new Set(seq).size < 2) {
        seq[0] = shuffle(keys)[0];
      }
      setSequence(seq);
      setInputIndex(0);
      setFeedback(null);
      setLastPress(null);
      roundCorrect.current = true;
      setPhase('watch');
      if (enabled && roundIdx === 0) say(t('pattern.watchInstruction'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfg.length, cfg.buttons, enabled, say, t],
  );

  // Watch animation
  useEffect(() => {
    if (phase !== 'watch' || sequence.length === 0) return;
    clearTimers();
    const step = cfg.displayMs + 260; // on + gap
    sequence.forEach((key, i) => {
      timers.current.push(
        window.setTimeout(() => setLitKey(key), i * step),
      );
      timers.current.push(
        window.setTimeout(() => setLitKey(null), i * step + cfg.displayMs),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setPhase('input');
      }, sequence.length * step + 150),
    );
    return clearTimers;
  }, [phase, sequence, cfg.displayMs]);

  const handleKey = (key: number) => {
    if (phase !== 'input') return;
    const expected = sequence[inputIndex];
    const correct = key === expected;
    if (correct) correctTotal.current += 1;
    else roundCorrect.current = false;
    stepsTotal.current += 1;
    setLastPress(key);
    window.setTimeout(() => setLastPress(null), 220);

    const nextIndex = inputIndex + 1;
    setInputIndex(nextIndex);

    if (nextIndex >= sequence.length) {
      // Evaluate this round using the running correctness flag.
      const result: 'correct' | 'partial' = roundCorrect.current
        ? 'correct'
        : 'partial';
      setFeedback(result);
      setPhase('feedback');
      if (enabled) {
        say(result === 'correct' ? t('pattern.correct') : t('pattern.incorrect'));
      }
      const nextRound = round + 1;
      timers.current.push(
        window.setTimeout(() => {
          if (nextRound >= TOTAL_ROUNDS) finish();
          else {
            setRound(nextRound);
            startRound(nextRound);
          }
        }, 1600),
      );
    }
  };

  const finish = () => {
    const total = Math.max(stepsTotal.current, 1);
    const score = Math.round((correctTotal.current / total) * 100);
    const durationSec = Math.round((Date.now() - startRef.current) / 1000);
    setPhase('done');
    onComplete({
      score,
      accuracy: score,
      attempts: TOTAL_ROUNDS,
      durationSec,
    });
  };

  const begin = () => {
    correctTotal.current = 0;
    stepsTotal.current = 0;
    startRef.current = Date.now();
    setRound(0);
    startRound(0);
  };

  return (
    <div className="stack-lg">
      <p className="text-muted">{t('pattern.watchInstruction')}</p>

      {phase !== 'idle' && (
        <div className="row-between">
          <span className="chip chip--green">
            {t('pattern.round')} {Math.min(round + 1, TOTAL_ROUNDS)} / {TOTAL_ROUNDS}
          </span>
          <div className="pattern-progress" aria-hidden="true">
            {Array.from({ length: sequence.length }).map((_, i) => (
              <span
                key={i}
                className={`pattern-dot ${i < inputIndex ? 'pattern-dot--filled' : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Status banner */}
      <div
        className={`banner ${
          feedback === 'correct'
            ? 'banner--green'
            : feedback === 'partial'
              ? 'banner--amber'
              : phase === 'watch'
                ? 'banner--amber'
                : 'banner--soft'
        }`}
        aria-live="polite"
      >
        <Icon name={phase === 'watch' ? 'sparkle' : 'hand'} size={22} />
        <span style={{ fontWeight: 700 }}>
          {phase === 'idle' && t('pattern.watchInstruction')}
          {phase === 'watch' && t('pattern.watch')}
          {phase === 'input' && t('pattern.tapInOrder')}
          {phase === 'feedback' &&
            (feedback === 'correct' ? t('pattern.correct') : t('pattern.incorrect'))}
          {phase === 'done' && t('pattern.correct')}
        </span>
      </div>

      {/* Pad */}
      <div className={`pattern-pad ${cfg.buttons === 6 ? 'pattern-pad--six' : ''}`}>
        {keys.map((key) => {
          const lit = litKey === key;
          const pressed = lastPress === key;
          return (
            <button
              key={key}
              type="button"
              className={[
                'pattern-key',
                lit ? 'pattern-key--lit' : '',
                pressed ? 'pattern-key--correct' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={phase !== 'input'}
              onClick={() => handleKey(key)}
              aria-label={`${t('pattern.title')} ${key}`}
            >
              {key}
            </button>
          );
        })}
      </div>

      {phase === 'idle' ? (
        <Button variant="primary" size="lg" block icon="play" onClick={begin}>
          {t('pattern.start')}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          block
          icon="refresh"
          onClick={() => {
            clearTimers();
            setLitKey(null);
            setPhase('watch');
          }}
          disabled={!(phase === 'input' && inputIndex === 0)}
        >
          {t('pattern.showAgain')}
        </Button>
      )}
    </div>
  );
}
