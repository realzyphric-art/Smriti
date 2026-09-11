import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { routineConfig } from '@/services/gameService';
import { ROUTINE_STEPS } from '@/data/games';
import { shuffle, type GameOutcome } from '@/utils/helpers';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';

interface Props {
  level: number;
  onComplete: (o: GameOutcome) => void;
}

export function DailyRoutine({ level, onComplete }: Props) {
  const { t } = useI18n();
  const { say, enabled } = useVoice();
  const cfg = useMemo(() => routineConfig(level), [level]);

  // Canonical correct order = first N steps.
  const canonical = useMemo(() => ROUTINE_STEPS.slice(0, cfg.steps), [cfg.steps]);
  const options = useMemo(() => shuffle(canonical), [canonical]);

  const [placed, setPlaced] = useState<string[]>([]); // step keys in chosen order
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const startRef = useRef(Date.now());

  const stepFor = (key: string) => canonical.find((s) => s.key === key)!;
  const label = (key: string) => t(`routine.steps.${key}`);

  const place = (key: string) => {
    if (checked || placed.includes(key)) return;
    setPlaced((p) => [...p, key]);
  };

  const reset = () => {
    setPlaced([]);
    setChecked(false);
    setScore(0);
    startRef.current = Date.now();
  };

  const check = () => {
    let correct = 0;
    placed.forEach((key, i) => {
      if (canonical[i] && canonical[i].key === key) correct += 1;
    });
    const pct = Math.round((correct / canonical.length) * 100);
    setScore(pct);
    setChecked(true);
    if (enabled) say(pct === 100 ? t('routine.wellDone') : t('routine.almostTitle'));
    const durationSec = Math.round((Date.now() - startRef.current) / 1000);
    window.setTimeout(
      () =>
        onComplete({
          score: pct,
          accuracy: pct,
          attempts: 1,
          durationSec,
        }),
      1600,
    );
  };

  const allPlaced = placed.length === canonical.length;
  const perfect = checked && score === 100;

  return (
    <div className="stack-lg">
      <p className="text-muted">{t('routine.instruction')}</p>

      {/* Your order slots */}
      <div>
        <div className="row-between" style={{ marginBottom: '0.5rem' }}>
          <h3>{t('routine.yourOrder')}</h3>
          {placed.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ minHeight: '2.75rem', padding: '0 0.75rem' }}
              onClick={reset}
            >
              <Icon name="refresh" size={20} /> {t('routine.reset')}
            </button>
          )}
        </div>
        <div className="routine-slots">
          {canonical.map((_, i) => {
            const key = placed[i];
            const isCorrect = checked && canonical[i].key === key;
            const isWrong = checked && key && canonical[i].key !== key;
            return (
              <div
                key={i}
                className={`routine-slot ${key ? 'routine-slot--filled' : ''}`}
                style={
                  isCorrect
                    ? { borderColor: 'var(--secondary)', background: 'var(--secondary-container)' }
                    : isWrong
                      ? { borderColor: 'var(--primary-container)' }
                      : undefined
                }
              >
                <span className="routine-slot__num">{i + 1}</span>
                {key ? (
                  <>
                    <span className="routine-slot__emoji" aria-hidden="true">
                      {stepFor(key).emoji}
                    </span>
                    <span className="routine-slot__label grow">{label(key)}</span>
                    {isCorrect && <Icon name="check" size={22} strokeWidth={3} />}
                  </>
                ) : (
                  <span className="routine-slot__hint">{t('routine.tapToAdd')}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Options */}
      {!checked && (
        <div className="routine-options">
          {options.map((step) => (
            <button
              key={step.key}
              type="button"
              className="routine-chip"
              disabled={placed.includes(step.key)}
              onClick={() => place(step.key)}
              aria-label={label(step.key)}
            >
              <span className="routine-chip__emoji" aria-hidden="true">
                {step.emoji}
              </span>
              <span className="grow">{label(step.key)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Feedback */}
      {checked && (
        <div className={`banner ${perfect ? 'banner--green' : 'banner--amber'}`} aria-live="polite">
          <span aria-hidden="true" style={{ fontSize: '1.6rem' }}>
            {perfect ? '🌼' : '🌱'}
          </span>
          <div>
            <strong>{perfect ? t('routine.wellDone') : t('routine.almostTitle')}</strong>
            <div style={{ fontSize: 'var(--fs-caption)' }}>
              {perfect ? t('routine.wellDoneBody') : ''}
            </div>
          </div>
        </div>
      )}

      {!checked && (
        <Button
          variant="primary"
          size="lg"
          block
          icon="check"
          disabled={!allPlaced}
          onClick={check}
        >
          {t('routine.check')}
        </Button>
      )}
    </div>
  );
}
