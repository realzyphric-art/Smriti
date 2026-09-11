import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useProgressData } from '@/hooks/useProgressData';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { CardSkeleton } from '@/components/Skeleton';
import { ContentState } from '@/components/ContentState';

export function Progress() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { summary, loading, error, reload } = useProgressData();
  const readScreen = `${t('progress.title')}. ${t('progress.subtitle')}`;

  if (loading) {
    return <><AppHeader subtitle={t('nav.progress')} readText={readScreen} /><main className="page stack"><CardSkeleton rows={3} /><CardSkeleton rows={4} /></main></>;
  }

  if (error) {
    return <><AppHeader subtitle={t('nav.progress')} readText={readScreen} /><main className="page"><ContentState title={t('progress.unavailable')} detail={error} tone="amber" action={{ label: t('common.retry'), onClick: () => void reload() }} /></main></>;
  }

  const completed = summary?.gamesCompleted ?? 0;
  const activeDays = summary?.daysPlayedThisWeek ?? 0;
  const weekly = summary?.weekly ?? [];
  const firstStep = completed === 0;
  const encouragement = firstStep
    ? t('progress.firstStep')
    : completed === 1
      ? t('progress.oneActivity')
      : t('progress.playedThisWeek', { n: completed });
  const activityPoints = completed + activeDays * 2 + (summary?.streakDays ?? 0);
  const activityLevel = Math.min(4, 1 + Math.floor(activityPoints / 5));
  const levelStart = (activityLevel - 1) * 5;
  const levelProgress = activityLevel === 4 ? 100 : Math.min(100, Math.round(((activityPoints - levelStart) / 5) * 100));
  const levelName = t(`progress.level${activityLevel}`);
  const weekFormatter = new Intl.DateTimeFormat(lang, { weekday: 'short' });

  return (
    <>
      <AppHeader subtitle={t('nav.progress')} readText={readScreen} />
      <main className="page progress-page">
        <section className="screen-intro">
          <p className="eyebrow">{t('progress.gentleLookBack')}</p>
          <h1>{t('progress.title')}</h1>
          <p>{t('progress.subtitle')}</p>
        </section>

        <section className="progress-celebration" aria-label={t('progress.thisWeek')}>
          <div className="progress-celebration__icon"><Icon name={firstStep ? 'leaf' : 'heart'} size={30} /></div>
          <div>
            <p className="eyebrow">{t('progress.thisWeek')}</p>
            <h2>{firstStep ? t('progress.freshStart') : t('progress.doingWell')}</h2>
            <p>{encouragement}</p>
          </div>
        </section>

        <section className="progress-week" aria-labelledby="week-title">
          <div className="section-heading"><h2 id="week-title">{t('progress.week')}</h2><span>{activeDays} {activeDays === 1 ? t('progress.day') : t('progress.days')} {t('progress.active')}</span></div>
          <div className="week-dots" role="img" aria-label={`${activeDays} ${activeDays === 1 ? t('progress.day') : t('progress.days')} ${t('progress.thisWeek').toLowerCase()}`}>
            {weekly.map((dayData, index) => {
              const active = (weekly[index]?.gamesCompleted ?? 0) > 0;
              const day = weekFormatter.format(new Date(`${dayData.date}T12:00:00`));
              return <div className={`week-dots__day ${active ? 'is-active' : ''}`} key={dayData.date}><span aria-hidden="true">{active ? <Icon name="check" size={18} /> : ''}</span><small>{day.slice(0, 3)}</small></div>;
            })}
          </div>
          <p className="text-muted">{t('progress.activityMark')}</p>
        </section>

        <section className="progress-level card" aria-labelledby="activity-level-title">
          <div className="row-between"><div><p className="eyebrow">{t('progress.activityLevel')}</p><h2 id="activity-level-title">{levelName}</h2></div><span className="progress-level__badge">{t('progress.levelValue', { n: activityLevel })}</span></div>
          <p className="text-muted">{t(`progress.level${activityLevel}Body`)}</p>
          <div className="progress-level__track" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={activityLevel} aria-valuetext={levelName}><div className="progress-level__fill" style={{ width: `${levelProgress}%` }} /></div>
          <div className="progress-level__scale"><span>{t('progress.levelStart')}</span><span>{activityLevel === 4 ? t('progress.levelComplete') : t('progress.nextLevel', { n: activityLevel + 1 })}</span></div>
        </section>

        <section className="progress-stats" aria-label={t('progress.stats')}>
          <div className="progress-stat"><strong>{completed}</strong><span>{t('progress.gamesCompleted')}</span></div>
          <div className="progress-stat"><strong>{activeDays}</strong><span>{t('progress.activeDaysShort')}</span></div>
          <div className="progress-stat"><strong>{summary?.streakDays ?? 0}</strong><span>{t('progress.streakShort')}</span></div>
        </section>

        <section className="progress-note">
          <Icon name="sparkle" size={24} />
          <div><strong>{t('progress.effortTitle')}</strong><p>{t('progress.effortBody')}</p></div>
        </section>

        {firstStep && <Button size="lg" block icon="play" onClick={() => navigate('/games')}>{t('progress.chooseActivity')}</Button>}
        <p className="disclaimer">{t('progress.trendDisclaimer')}</p>
      </main>
    </>
  );
}
