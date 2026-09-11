import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useProgressData } from '@/hooks/useProgressData';
import { useReminders } from '@/hooks/useReminders';
import { useToast } from '@/hooks/useToast';
import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { CaregiverAlert } from '@/components/CaregiverAlert';
import { CardSkeleton } from '@/components/Skeleton';
import { ContentState } from '@/components/ContentState';
import { isSupabaseConfigured } from '@/lib/supabase';
import { listAuthorizedPatients } from '@/services/patientService';
import { patientLastSyncedAt } from '@/services/sharingService';
import { GAME_DEFINITIONS } from '@/services/gameService';
import { downloadCaregiverReport } from '@/services/reportService';

export function CaregiverOverview() {
  const { t } = useI18n(); const { settings } = useSettings(); const navigate = useNavigate(); const { showToast } = useToast();
  const { summary, sessions, recentSessions, loading, error, reload } = useProgressData(); const { reminders, completedCount, loading: remindersLoading } = useReminders();
  const [authorized, setAuthorized] = useState(false); const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const activePatientId = settings.activePatientId;
  useEffect(() => {
    let alive = true;
    if (!isSupabaseConfigured || !activePatientId || settings.role !== 'caregiver') { setAuthorized(false); setLastSyncedAt(null); return () => { alive = false; }; }
    void listAuthorizedPatients().then((patients) => {
      if (!alive) return;
      const allowed = patients.some((candidate) => candidate.id === activePatientId);
      setAuthorized(allowed);
      if (allowed) void patientLastSyncedAt(activePatientId).then((value) => { if (alive) setLastSyncedAt(value); });
    }).catch(() => { if (alive) setAuthorized(false); });
    return () => { alive = false; };
  }, [activePatientId, settings.role]);
  const patient = settings.patientName.trim() || 'Patient'; const canView = Boolean(settings.activePatientId && authorized);
  const completed = sessions.filter((session) => session.completed); const score = summary?.averageScore ?? 0; const level = summary?.currentLevel ?? 1;
  const byCategory = Object.entries(completed.reduce<Record<string, typeof sessions>>((groups, session) => { const category = GAME_DEFINITIONS[session.gameType].category; (groups[category] ??= []).push(session); return groups; }, {}));
  const report = () => { if (!canView) return showToast('Sharing consent is required.', '🔒'); void downloadCaregiverReport({ patientName: patient, sessions, reminders }).catch(() => showToast('Unable to generate the report.', '⚠️')); };
  return <><AppHeader subtitle={t('nav.overview')} readText={`${t('caregiver.title')}. ${patient}.`} /><main className="page"><div className="stack-lg"><div className="row-between"><div><p className="eyebrow">{t('caregiver.subtitle')}</p><h1 className="page-title">{t('caregiver.title')}</h1></div><span className={`pill ${canView ? 'pill--green' : 'pill--amber'}`}>{canView ? 'Connected' : 'Sharing off'}</span></div>
    {!canView && <ContentState title="Patient activity is private" detail="Select an authorized patient or ask the patient to enable sharing." tone="amber" action={{ label: 'Choose patient', onClick: () => navigate('/caregiver/patient') }} />}
    {error && <ContentState title="Activity is unavailable" detail={error} tone="amber" action={{ label: 'Try again', onClick: () => void reload() }} />}
    <Card padLg><div className="row" style={{ gap: '.9rem' }}><span className="medallion medallion--green" aria-hidden="true">{patient.charAt(0)}</span><div className="grow"><h2 className="card-title">{patient}</h2><p className="muted">Selected patient</p></div><Button variant="ghost" onClick={() => navigate('/caregiver/patient')}>Change</Button></div></Card>
    {loading || remindersLoading ? <CardSkeleton rows={4} /> : <><Card><div className="row-between"><h2 className="card-title">Activity overview</h2><span className="pill pill--green">Level {level}</span></div><div className="stat-grid" style={{ marginTop: '.75rem' }}><div className="stat-card"><div className="stat-card__value">{completed.length}</div><div className="stat-card__label">Sessions</div></div><div className="stat-card"><div className="stat-card__value">{score}%</div><div className="stat-card__label">Average accuracy</div></div><div className="stat-card"><div className="stat-card__value">{completedCount}/{reminders.length}</div><div className="stat-card__label">Reminders today</div></div><div className="stat-card"><div className="stat-card__value">{summary?.daysPlayedThisWeek ?? 0}</div><div className="stat-card__label">Days active</div></div></div></Card>
    <CaregiverAlert tone={score >= 80 ? 'good' : score >= 50 ? 'info' : 'warn'} emoji={score >= 80 ? '🌿' : '💡'} title={score >= 80 ? 'Improving' : score >= 50 ? 'Stable' : 'Needs more practice'} detail="These are activity trends, not a medical diagnosis." />
    <Card><h2 className="card-title">Performance by category</h2>{byCategory.length ? byCategory.map(([category, entries]) => <div className="metric-row" key={category}><span>{category}</span><span className="pill pill--green">{Math.round(entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length)}%</span></div>) : <p className="muted">No completed games yet.</p>}</Card>
    <Card><h2 className="card-title">Recent sessions</h2>{recentSessions.length ? recentSessions.map((session) => <div className="metric-row" key={session.id}><div><strong>{GAME_DEFINITIONS[session.gameType].title}</strong><div className="muted">Level {session.level}</div></div><span className="pill">{session.score}%</span></div>) : <p className="muted">No recent sessions.</p>}</Card></>}
    <Card><h2 className="card-title">Care actions</h2><div className="stack-sm" style={{ marginTop: '.75rem' }}><Button variant="secondary" block icon="users" onClick={() => navigate('/caregiver/patient')}>Patient profile</Button><Button variant="secondary" block icon="bell" onClick={() => navigate('/caregiver/reminders')}>Manage reminders</Button><Button variant="secondary" block icon="alert" onClick={() => navigate('/caregiver/emergency')}>Emergency settings</Button><Button variant="ghost" block icon="download" onClick={report}>Generate PDF Report</Button></div></Card>
    {canView && <Card><h2 className="card-title">Data freshness</h2><p className="muted" style={{ marginTop: '.35rem' }}>Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not synced yet'}</p><p className="muted" style={{ marginTop: '.35rem' }}>Only information approved by the patient is shown.</p></Card>}
    <p className="disclaimer">{t('caregiver.trendDisclaimer')}</p></div></main></>;
}
