import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useProgressData } from '@/hooks/useProgressData';
import { weekdayInitials } from '@/services/progressService';
import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/Card';
import { ProgressChart } from '@/components/ProgressChart';
import { CaregiverAlert } from '@/components/CaregiverAlert';

export function CaregiverProgress() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const { summary } = useProgressData();

  const initials = weekdayInitials();
  const bars =
    summary?.weekly.map((d, i) => ({
      label: initials[i] ?? '',
      value: d.gamesCompleted,
      variant: d.gamesCompleted > 0 ? ('default' as const) : ('muted' as const),
    })) ?? [];

  const scoreBars =
    summary?.weekly.map((d, i) => ({
      label: initials[i] ?? '',
      value: d.averageScore,
      variant: 'amber' as const,
    })) ?? [];

  const daysPlayed = summary?.daysPlayedThisWeek ?? 0;
  const changed = daysPlayed >= 3;

  const readScreen = `${t('caregiver.cognitiveTitle')}. ${t('caregiver.cognitiveSub')}.`;

  return (
    <>
      <AppHeader subtitle={t('nav.progress')} readText={readScreen} />
      <main className="page">
        <div className="stack-lg">
          <div>
            <p className="eyebrow">{settings.patientName}</p>
            <h1 className="page-title">{t('caregiver.cognitiveTitle')}</h1>
            <p className="page-sub">{t('caregiver.cognitiveSub')}</p>
          </div>

          <Card padLg>
            <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
              {t('caregiver.dailyEngagement')}
            </h2>
            <ProgressChart bars={bars} ariaLabel={t('caregiver.dailyEngagement')} />
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              {t('caregiver.engagementTarget')}
            </p>
          </Card>

          <Card padLg>
            <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>
              {t('caregiver.completion')}
            </h2>
            <ProgressChart
              bars={scoreBars}
              max={100}
              ariaLabel={t('caregiver.completion')}
            />
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              {t('caregiver.highFocus')}
            </p>
          </Card>

          <CaregiverAlert
            tone={changed ? 'good' : 'info'}
            emoji={changed ? '📈' : '🌿'}
            title={
              changed
                ? t('caregiver.activitySteady')
                : t('caregiver.activityChanged')
            }
          />

          <p className="disclaimer">{t('caregiver.trendDisclaimer')}</p>
        </div>
      </main>
    </>
  );
}
