import { useEffect } from 'react';
import type { GameResultData } from '@/types';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { Card } from './Card';
import { Button } from './Button';
import { Icon } from './Icon';

interface GameResultProps {
  result: GameResultData;
  onContinue: () => void;
  onPlayAgain: () => void;
  onHome: () => void;
}

export function GameResult({ result, onContinue, onPlayAgain, onHome }: GameResultProps) {
  const { t } = useI18n();
  const { say, enabled } = useVoice();

  useEffect(() => {
    if (enabled) say(`${t('result.greatJob')} ${t('result.completed')}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const levelMsg =
    result.levelChange === 'up'
      ? t('result.levelUp')
      : result.levelChange === 'down'
        ? t('result.levelDown')
        : t('result.levelSame');

  return (
    <div className="stack-lg">
      <Card padLg className="stack text-center">
        <div className="pop" style={{ fontSize: '3.5rem', lineHeight: 1 }} aria-hidden="true">
          🎉
        </div>
        <h1>{t('result.greatJob')}</h1>
        <p className="text-muted" style={{ fontSize: 'var(--fs-body-lg)' }}>
          {t('result.completed')}
        </p>

        <div className="grid-3" style={{ marginTop: '0.5rem' }}>
          <div className="stat text-center">
            <div className="stat__value">{result.score}%</div>
            <div className="stat__label">{t('result.score')}</div>
          </div>
          <div className="stat text-center">
            <div className="stat__value">{result.accuracy}%</div>
            <div className="stat__label">{t('result.accuracy')}</div>
          </div>
          <div className="stat text-center">
            <div className="stat__value">
              {t('home.level')} {result.newLevel}
            </div>
            <div className="stat__label">{t('result.currentLevel')}</div>
          </div>
        </div>

        <div
          className={`banner ${
            result.levelChange === 'up'
              ? 'banner--green'
              : result.levelChange === 'down'
                ? 'banner--amber'
                : 'banner--soft'
          }`}
          style={{ marginTop: '0.5rem', textAlign: 'left' }}
        >
          <Icon name={result.levelChange === 'up' ? 'star' : 'heart'} size={22} />
          <span style={{ fontWeight: 700 }}>{levelMsg}</span>
        </div>
      </Card>

      <div className="banner banner--soft">
        <Icon name="sparkle" size={22} />
        <span>{t('result.adaptiveNote')}</span>
      </div>

      <div className="stack-sm">
        <Button variant="primary" size="lg" block iconRight="arrow-right" onClick={onContinue}>
          {t('result.continue')}
        </Button>
        <div className="grid-2">
          <Button variant="secondary" icon="refresh" onClick={onPlayAgain}>
            {t('result.playAgain')}
          </Button>
          <Button variant="secondary" icon="home" onClick={onHome}>
            {t('result.backHome')}
          </Button>
        </div>
      </div>
    </div>
  );
}
