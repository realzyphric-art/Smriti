import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useReminders } from '@/hooks/useReminders';
import { useProgressData } from '@/hooks/useProgressData';
import { greetingKey } from '@/utils/helpers';
import { formatTime } from '@/services/reminderService';
import { AppHeader } from '@/components/AppHeader';
import { OfflineBanner } from '@/components/OfflineBanner';
import { VoiceButton } from '@/components/VoiceButton';
import { Icon } from '@/components/Icon';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const DAILY_GAME_GOAL = 3;

export function PatientHome() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const {
    reminders,
    completedCount,
    toggle,
    loading: remindersLoading,
    error: remindersError,
  } = useReminders();
  const { todayGames } = useProgressData();
  const greeting = t(`welcome.${greetingKey()}`);
  const routineItems = reminders.slice(0, 4);
  const nextReminder = routineItems.find((reminder) => !reminder.completed);
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const activityPercent = Math.min(100, Math.round(((reminders.length ? completedCount / reminders.length : 0) * 0.65 + Math.min(todayGames / DAILY_GAME_GOAL, 1) * 0.35) * 100));
  const planText = `${greeting}, ${settings.patientName}. ${t('home.oneStep')} ${routineItems
    .map((reminder) => `${reminder.title} ${formatTime(reminder.time)}`)
    .join('. ')}`;

  return (
    <>
      <AppHeader subtitle={t('nav.home')} readText={planText} />
      <main className="page patient-home">
        <section className="home-intro" aria-labelledby="patient-home-title">
          <div className="home-intro__meta">
            <span className="home-intro__eyebrow">{today}</span>
            <span className="row" aria-label={online ? t('offline.worksOffline') : t('offline.youreOffline')}>
              <Icon name={online ? 'wifi' : 'wifi-off'} size={16} />
              {online ? t('offline.worksOffline') : t('offline.youreOffline')}
            </span>
          </div>
          <h1 id="patient-home-title">{greeting}, {settings.patientName}</h1>
          <p>{t('home.intro')}</p>
          <VoiceButton text={planText} label={t('home.hearPlan')} />
        </section>

        <OfflineBanner />

        {settings.guestMode && (
          <div className="state-banner state-banner--success" role="status">
            <strong>{t('common.guestMode')}</strong>
            <span>{t('home.guestSaved')}</span>
          </div>
        )}

        <section className="next-step" aria-labelledby="next-step-title">
          <div className="next-step__content">
            <div className="next-step__kicker"><span className="next-step__dot" /> {t('home.nextStep')}</div>
            <h2 id="next-step-title">{nextReminder?.title ?? t('home.startGame')}</h2>
            <p>
              {nextReminder
                ? `${formatTime(nextReminder.time)} · ${nextReminder.detail}`
                : t('home.startGameSub')}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() =>
                nextReminder
                  ? void toggle(nextReminder)
                  : navigate('/games/picture-pairs')
              }
            >
              <Icon name={nextReminder ? 'check' : 'play'} size={20} />
              <span>{nextReminder ? t('home.complete') : t('games.play')}</span>
            </button>
          </div>
        </section>

        <section className="mobile-section" aria-labelledby="today-title">
          <div className="mobile-section__heading">
            <h2 id="today-title">{t('home.todaysRoutine')}</h2>
            <p>{completedCount} / {reminders.length} {t('home.ofDone')}</p>
          </div>
          <div className="day-progress" aria-label={`${activityPercent}${t('home.todayPlanPercent')} complete`}>
            <div className="day-progress__track">
              <div className="day-progress__fill" style={{ width: `${activityPercent}%` }} />
            </div>
            <p className="text-muted">{activityPercent}{t('home.todayPlanPercent')}</p>
          </div>

          {remindersLoading && (
            <div className="empty-state" role="status">
              <strong>{t('home.loadingPlan')}</strong>
              <span className="text-muted">{t('home.loadingPlanBody')}</span>
            </div>
          )}
          {remindersError && (
            <div className="state-banner state-banner--error" role="alert">
              <strong>{t('home.remindersError')}</strong>
              <span>{remindersError}</span>
            </div>
          )}
          {!remindersLoading && !remindersError && routineItems.length === 0 && (
            <div className="empty-state">
              <strong>{t('reminders.emptyTitle')}</strong>
              <span className="text-muted">{t('reminders.emptyBody')}</span>
            </div>
          )}
          {!remindersLoading && !remindersError && routineItems.length > 0 && (
            <div className="mobile-list">
              {routineItems.map((reminder) => (
                <div key={reminder.id} className={`mobile-row ${reminder.completed ? 'is-complete' : ''}`}>
                  <span className="mobile-row__icon" aria-hidden="true">
                    <Icon name={reminder.completed ? 'check' : 'clock'} size={22} />
                  </span>
                  <div className="mobile-row__body">
                    <div className="mobile-row__title">{reminder.title}</div>
                    <div className="mobile-row__meta">
                      {formatTime(reminder.time)} · {reminder.detail}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn mobile-row__action ${reminder.completed ? 'btn--secondary' : 'btn--ghost'}`}
                    onClick={() => void toggle(reminder)}
                    aria-label={`${reminder.completed ? t('reminders.completed') : t('home.tapToCheck')}: ${reminder.title}`}
                  >
                    <Icon name="check" size={19} />
                    <span>{reminder.completed ? t('common.done') : t('home.complete')}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn btn--ghost btn--block" onClick={() => navigate('/reminders')}>
            <Icon name="bell" size={20} />
            <span>{t('reminders.title')}</span>
          </button>
        </section>
        <section className="home-reassurance" aria-label={t('home.todayGlance')}>
          <div className="home-reassurance__icon"><Icon name="heart" size={22} /></div>
          <div><strong>{t('home.doingWell')}</strong><p>{t('home.noRush', { n: activityPercent })}</p></div>
        </section>
      </main>
    </>
  );
}
