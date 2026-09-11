import { useI18n } from '@/i18n';
import { useReminders } from '@/hooks/useReminders';
import { useProgressData } from '@/hooks/useProgressData';
import { formatTime } from '@/services/reminderService';
import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/Card';
import { CaregiverAlert } from '@/components/CaregiverAlert';

interface AlertItem {
  tone: 'info' | 'warn' | 'good';
  emoji: string;
  title: string;
  detail?: string;
}

export function CaregiverAlerts() {
  const { t } = useI18n();
  const { reminders, completedCount } = useReminders();
  const { summary } = useProgressData();

  const alerts: AlertItem[] = [];

  const missedReminders = reminders.filter((r) => !r.completed);
  if (missedReminders.length > 0) {
    alerts.push({
      tone: 'warn',
      emoji: '⏰',
      title: t('caregiver.missedThisWeek', { n: missedReminders.length }),
      detail: missedReminders
        .map((r) => `${r.icon} ${r.title} · ${formatTime(r.time)}`)
        .join('   '),
    });
  }

  const daysPlayed = summary?.daysPlayedThisWeek ?? 0;
  if (daysPlayed === 0) {
    alerts.push({
      tone: 'info',
      emoji: '🌱',
      title: t('caregiver.activityChanged'),
    });
  }

  if (completedCount > 0 && missedReminders.length === 0) {
    alerts.push({
      tone: 'good',
      emoji: '✅',
      title: t('caregiver.allOnTrack'),
    });
  }

  const readScreen = `${t('caregiver.alertsTitle')}.`;

  return (
    <>
      <AppHeader subtitle={t('nav.alerts')} readText={readScreen} />
      <main className="page">
        <div className="stack-lg">
          <div>
            <h1 className="page-title">{t('caregiver.alertsTitle')}</h1>
          </div>

          {alerts.length === 0 ? (
            <Card variant="tint" padLg>
              <div className="text-center stack">
                <span aria-hidden="true" style={{ fontSize: '3rem' }}>
                  🌿
                </span>
                <p style={{ margin: 0 }}>{t('caregiver.noAlerts')}</p>
              </div>
            </Card>
          ) : (
            <div className="stack">
              {alerts.map((a, i) => (
                <CaregiverAlert
                  key={i}
                  tone={a.tone}
                  emoji={a.emoji}
                  title={a.title}
                  detail={a.detail}
                />
              ))}
            </div>
          )}

          <p className="disclaimer">{t('caregiver.trendDisclaimer')}</p>
        </div>
      </main>
    </>
  );
}
