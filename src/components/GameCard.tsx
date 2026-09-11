import { useI18n } from '@/i18n';
import { Button } from './Button';
import { Icon } from './Icon';

interface GameCardProps {
  title: string;
  description: string;
  toneKey: 'easy' | 'calm' | 'relaxing';
  minutes: string;
  onPlay: () => void;
  onHear?: () => void;
}

const toneToVariant: Record<GameCardProps['toneKey'], string> = {
  easy: 'medallion--green',
  calm: 'medallion--amber',
  relaxing: 'medallion--soft',
};

const toneToIcon = {
  easy: 'leaf',
  calm: 'heart',
  relaxing: 'sparkle',
} as const;

export function GameCard({
  title,
  description,
  toneKey,
  minutes,
  onPlay,
  onHear,
}: GameCardProps) {
  const { t } = useI18n();
  return (
    <article className={`activity-card activity-card--${toneKey}`}>
      <div className="activity-card__top">
        <span className={`activity-card__art ${toneToVariant[toneKey]}`} aria-hidden="true">
          <Icon name={toneToIcon[toneKey]} size={25} />
        </span>
        <div className="activity-card__body">
          <div className="activity-card__eyebrow">{t(`games.${toneKey}`)} · {minutes} {t('games.mins')}</div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {onHear && (
          <button
            type="button"
            className="activity-card__listen"
            aria-label={t('common.readAloud')}
            onClick={onHear}
          >
            <Icon name="volume" size={22} />
          </button>
        )}
      </div>
      <Button variant="secondary" size="lg" block icon="play" onClick={onPlay}>
        {t('games.play')}
      </Button>
    </article>
  );
}
