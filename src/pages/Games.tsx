import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useVoice } from '@/hooks/useVoice';
import { AppHeader } from '@/components/AppHeader';
import { GameCard } from '@/components/GameCard';
import { VoiceButton } from '@/components/VoiceButton';
import { Icon } from '@/components/Icon';

export function Games() {
  const { t } = useI18n();
  const { say } = useVoice();
  const navigate = useNavigate();

  const readScreen = `${t('games.title')}. ${t('games.subtitle')}`;

  return (
    <>
      <AppHeader subtitle={t('nav.games')} readText={readScreen} />
      <main className="page">
        <div className="screen-intro">
          <h1>{t('games.title')}</h1>
          <p className="text-muted" style={{ fontSize: 'var(--fs-body-lg)' }}>
            {t('games.subtitle')}
          </p>
        </div>

        <VoiceButton
          text={`${t('games.picturePairs')}. ${t('games.picturePairsDesc')} ${t(
            'games.patternRecall',
          )}. ${t('games.patternRecallDesc')} ${t('games.dailyRoutine')}. ${t(
            'games.dailyRoutineDesc',
          )}`}
          label={t('games.listenInstructions')}
        />

        <div className="activity-feature">
          <div className="activity-feature__art"><Icon name="sparkle" size={30} /></div>
          <div className="activity-feature__body">
            <span className="activity-card__eyebrow">{t('games.recommended')}</span>
            <h2>{t('games.memoryMatch')}</h2>
            <p>{t('games.memoryMatchDesc')}</p>
          </div>
        </div>

        <div className="section-heading"><h2>{t('games.chooseFamiliar')}</h2><span>{t('games.takeYourTime')}</span></div>

        <GameCard
          title={t('games.picturePairs')}
          description={t('games.picturePairsDesc')}
          toneKey="easy"
          minutes="3–5"
          onPlay={() => navigate('/games/picture-pairs')}
          onHear={() => say(`${t('games.picturePairs')}. ${t('games.picturePairsDesc')}`)}
        />
        <GameCard title={t('games.familiarFaces')} description={t('games.familiarFacesDesc')} toneKey="calm" minutes="2–4" onPlay={() => navigate('/games/who-is-this-person')} onHear={() => say(`${t('games.familiarFaces')}. ${t('games.familiarFacesDesc')}`)} />
        <GameCard
          title={t('games.patternRecall')}
          description={t('games.patternRecallDesc')}
          toneKey="calm"
          minutes="3"
          onPlay={() => navigate('/games/pattern-recall')}
          onHear={() => say(`${t('games.patternRecall')}. ${t('games.patternRecallDesc')}`)}
        />
        <GameCard
          title={t('games.dailyRoutine')}
          description={t('games.dailyRoutineDesc')}
          toneKey="relaxing"
          minutes="4"
          onPlay={() => navigate('/games/daily-routine')}
          onHear={() => say(`${t('games.dailyRoutine')}. ${t('games.dailyRoutineDesc')}`)}
        />

        <div className="activity-note">
          <span className="medallion medallion--amber" aria-hidden="true">
            <Icon name="heart" size={24} />
          </span>
          <div>
            <strong>{t('games.alwaysPace')}</strong>
            <div style={{ fontSize: 'var(--fs-caption)' }}>{t('games.alwaysPaceBody')}</div>
          </div>
        </div>
      </main>
    </>
  );
}
