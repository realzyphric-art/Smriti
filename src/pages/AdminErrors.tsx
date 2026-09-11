import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { ContentState } from '@/components/ContentState';
import { Sheet } from '@/components/Sheet';
import { supabase } from '@/lib/supabase';
import { isCurrentUserAdmin } from '@/services/authService';
import { errorLogger, type DiagnosticSeverity } from '@/services/errorLogger';
import { getUnconfiguredAIStatuses } from '@/services/monitoring/aiMonitoring';

interface SystemEvent {
  id: string;
  created_at: string;
  severity: DiagnosticSeverity;
  event_type: string;
  feature: string;
  route: string | null;
  action: string | null;
  message: string;
  error_code: string | null;
  http_status: number | null;
  stack_trace: string | null;
  request_id: string | null;
  user_id: string | null;
  session_state: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  app_version: string | null;
  environment: string | null;
  fingerprint: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
}

type AdminState = 'loading' | 'ready' | 'denied' | 'unavailable' | 'error';
type ResolvedFilter = 'all' | 'open' | 'resolved';
type SortMode = 'newest' | 'oldest' | 'occurrences' | 'severity';

const severities: Array<DiagnosticSeverity | 'all'> = ['all', 'critical', 'error', 'warning', 'info', 'debug'];

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function severityWeight(value: DiagnosticSeverity): number {
  return { critical: 5, error: 4, warning: 3, info: 2, debug: 1 }[value];
}

function safeDetail(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2).slice(0, 12000);
  } catch {
    return '[unavailable]';
  }
}

interface EventGroup {
  key: string;
  latest: SystemEvent;
  count: number;
  users: number;
  firstAt: string;
}

export function AdminErrors() {
  const navigate = useNavigate();
  const [state, setState] = useState<AdminState>('loading');
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [selected, setSelected] = useState<SystemEvent | null>(null);
  const [severity, setSeverity] = useState<DiagnosticSeverity | 'all'>('all');
  const [resolved, setResolved] = useState<ResolvedFilter>('open');
  const [feature, setFeature] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!supabase) {
      setState('unavailable');
      return;
    }
    setState('loading');
    if (!(await isCurrentUserAdmin())) {
      setState('denied');
      return;
    }
    const { data, error } = await supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) {
      void errorLogger.captureRequestError(error, { feature: 'admin', eventType: 'ADMIN_EVENTS_LOAD_FAILED', action: 'load_events' });
      setState('error');
      return;
    }
    setEvents((data ?? []) as SystemEvent[]);
    setState('ready');
  }, []);

  useEffect(() => {
    let live = true;
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined;
    const start = async () => {
      if (!supabase || !(await isCurrentUserAdmin())) {
        if (live) setState(supabase ? 'denied' : 'unavailable');
        return;
      }
      const { data, error } = await supabase.from('system_events').select('*').order('created_at', { ascending: false }).limit(500);
      if (!live) return;
      if (error) {
        void errorLogger.captureRequestError(error, { feature: 'admin', eventType: 'ADMIN_EVENTS_LOAD_FAILED', action: 'load_events' });
        setState('error');
        return;
      }
      setEvents((data ?? []) as SystemEvent[]);
      setState('ready');
      channel = supabase.channel('admin-system-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_events' }, (payload) => {
        if (!live) return;
        setEvents((current) => [payload.new as SystemEvent, ...current.filter((event) => event.id !== (payload.new as SystemEvent).id)].slice(0, 500));
      }).subscribe();
    };
    void start();
    return () => {
      live = false;
      if (channel) void supabase?.removeChannel(channel);
    };
  }, []);

  const features = useMemo(() => ['all', ...Array.from(new Set(events.map((event) => event.feature))).sort()], [events]);
  const groups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = events.filter((event) => {
      if (severity !== 'all' && event.severity !== severity) return false;
      if (resolved === 'open' && event.resolved) return false;
      if (resolved === 'resolved' && !event.resolved) return false;
      if (feature !== 'all' && event.feature !== feature) return false;
      if (fromDate && event.created_at.slice(0, 10) < fromDate) return false;
      if (toDate && event.created_at.slice(0, 10) > toDate) return false;
      if (normalizedSearch && ![event.message, event.event_type, event.route, event.request_id, event.fingerprint].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });
    const grouped = new Map<string, EventGroup>();
    for (const event of filtered) {
      const key = event.fingerprint || `${event.feature}:${event.event_type}:${event.message}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { key, latest: event, count: 1, users: event.user_id ? 1 : 0, firstAt: event.created_at });
      } else {
        current.count += 1;
        if (event.user_id) current.users += 1;
        if (event.created_at > current.latest.created_at) current.latest = event;
        if (event.created_at < current.firstAt) current.firstAt = event.created_at;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => {
      if (sort === 'occurrences') return b.count - a.count;
      if (sort === 'severity') return severityWeight(b.latest.severity) - severityWeight(a.latest.severity);
      return sort === 'oldest' ? a.latest.created_at.localeCompare(b.latest.created_at) : b.latest.created_at.localeCompare(a.latest.created_at);
    });
  }, [events, feature, fromDate, resolved, search, severity, sort, toDate]);

  const resolve = async (event: SystemEvent) => {
    if (!supabase) return;
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('system_events').update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userData.user?.id ?? null }).eq('id', event.id);
    if (error) {
      void errorLogger.captureRequestError(error, { feature: 'admin', eventType: 'ADMIN_EVENT_RESOLVE_FAILED', action: 'resolve_event' });
      setNotice('Could not resolve this event.');
      return;
    }
    setEvents((current) => current.map((item) => item.id === event.id ? { ...item, resolved: true, resolved_at: new Date().toISOString(), resolved_by: userData.user?.id ?? null } : item));
    setSelected(null);
    setNotice('Event marked resolved.');
  };

  const copyDetails = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(safeDetail(selected));
      setNotice('Event details copied.');
    } catch {
      setNotice('Copy is not available in this browser.');
    }
  };

  if (state === 'unavailable') return <><AppHeader subtitle="Diagnostics" showBack onBack={() => navigate('/')} /><main className="page page--flow"><ContentState title="Diagnostics unavailable" detail="Cloud auth is disabled or Supabase is not configured. Guest Mode continues to work locally." /></main></>;
  if (state === 'denied') return <><AppHeader subtitle="Diagnostics" showBack onBack={() => navigate('/')} /><main className="page page--flow"><ContentState title="Admin access required" detail="This dashboard is restricted to explicitly provisioned system administrators." /></main></>;
  if (state === 'error') return <><AppHeader subtitle="Diagnostics" showBack onBack={() => navigate('/')} /><main className="page page--flow"><ContentState title="Could not load diagnostics" detail="The dashboard could not read system events. Check the migration, session, and RLS policy." action={{ label: 'Try again', onClick: () => void load() }} tone="amber" /></main></>;

  const critical = events.filter((event) => event.severity === 'critical' && !event.resolved).length;
  const unresolved = events.filter((event) => !event.resolved).length;
  const recent = events.filter((event) => Date.now() - new Date(event.created_at).getTime() < 86_400_000).length;
  const aiStatuses = getUnconfiguredAIStatuses();

  return (
    <>
      <AppHeader subtitle="Error diagnostics" showBack onBack={() => navigate('/')} />
      <main className="page stack" style={{ paddingBottom: '3rem' }}>
        <div>
          <p className="eyebrow">Administrator console</p>
          <h1 className="page-title">System events</h1>
          <p className="page-sub">Live, privacy-filtered diagnostics grouped by recurring issue.</p>
        </div>

        <div className="stat-grid">
          <div className="stat-card"><div className="stat-card__value">{unresolved}</div><div className="stat-card__label">Open issues</div></div>
          <div className="stat-card"><div className="stat-card__value">{critical}</div><div className="stat-card__label">Critical</div></div>
          <div className="stat-card"><div className="stat-card__value">{recent}</div><div className="stat-card__label">Last 24 hours</div></div>
        </div>

        <div className="grid-3" aria-label="Service status">
          {[
            ['Frontend', 'Operational'],
            ['Auth', 'Operational'],
            ['Database', 'Operational'],
            ['Storage', 'Not checked'],
            ['Edge Functions', 'Not checked'],
          ].map(([name, status]) => <div className="card row-between" key={name}><span><strong>{name}</strong><small className="muted" style={{ display: 'block' }}>Current dashboard view</small></span><span className={`pill ${status === 'Operational' ? 'pill--green' : 'pill--amber'}`}>{status}</span></div>)}
        </div>

        <section className="card stack-sm" aria-labelledby="ai-operations-title">
          <div>
            <h2 id="ai-operations-title" className="card-title">AI operations</h2>
            <p className="muted">Both AI systems are placeholders. No provider health check or private AI request is configured.</p>
          </div>
          <div className="grid-2">
            {aiStatuses.map((provider) => <div className="card row-between" key={provider.provider}>
              <span><strong>{provider.label}</strong><small className="muted" style={{ display: 'block' }}>{provider.detail}</small></span>
              <span className="pill pill--amber">Unknown</span>
            </div>)}
          </div>
        </section>

        <div className="card stack-sm" aria-label="Diagnostics filters">
          <div className="grid-2">
            <label className="field"><span className="field__label">Severity</span><select className="input" value={severity} onChange={(event) => setSeverity(event.target.value as DiagnosticSeverity | 'all')}>{severities.map((value) => <option key={value} value={value}>{value === 'all' ? 'All severities' : value}</option>)}</select></label>
            <label className="field"><span className="field__label">Feature</span><select className="input" value={feature} onChange={(event) => setFeature(event.target.value)}>{features.map((value) => <option key={value} value={value}>{value === 'all' ? 'All features' : value}</option>)}</select></label>
            <label className="field"><span className="field__label">Status</span><select className="input" value={resolved} onChange={(event) => setResolved(event.target.value as ResolvedFilter)}><option value="open">Open only</option><option value="resolved">Resolved only</option><option value="all">All statuses</option></select></label>
            <label className="field"><span className="field__label">Sort</span><select className="input" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="occurrences">Most occurrences</option><option value="severity">Highest severity</option></select></label>
          </div>
          <label className="field"><span className="field__label">Search</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Message, event type, route, request ID…" /></label>
          <div className="grid-2"><label className="field"><span className="field__label">From</span><input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="field"><span className="field__label">To</span><input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div>
        </div>

        {notice && <p className="banner banner--soft" role="status">{notice}</p>}
        {state === 'loading' ? <ContentState title="Loading diagnostics…" detail="Checking administrator access and the live event stream." /> : groups.length === 0 ? <ContentState title="No matching events" detail="Try widening the filters or wait for a new event." /> : <div className="stack-sm" aria-live="polite">{groups.map((group) => <button type="button" className="card row-between" style={{ textAlign: 'left', width: '100%', border: '1px solid var(--outline)' }} key={group.key} onClick={() => setSelected(group.latest)}><div className="stack-sm" style={{ minWidth: 0 }}><div className="row"><span className={`pill ${group.latest.severity === 'critical' || group.latest.severity === 'error' ? 'pill--amber' : 'pill--green'}`}>{group.latest.severity}</span><strong>{group.latest.event_type}</strong></div><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.latest.message}</span><small className="muted">{group.latest.feature} · {formatDate(group.latest.created_at)} · {group.users} affected users</small></div><div className="stack-sm" style={{ textAlign: 'right', flexShrink: 0 }}><strong>{group.count}×</strong><small className="muted">{group.latest.resolved ? 'Resolved' : 'Open'}</small></div></button>)}</div>}
      </main>
      <Sheet open={Boolean(selected)} title={selected ? selected.event_type : 'Event details'} onClose={() => setSelected(null)}>{selected && <div className="stack"><div className="row-between"><span className={`pill ${selected.severity === 'critical' || selected.severity === 'error' ? 'pill--amber' : 'pill--green'}`}>{selected.severity}</span><span className="muted">{formatDate(selected.created_at)}</span></div><p><strong>{selected.message}</strong></p><div className="stack-sm"><span className="muted">Feature: {selected.feature}</span><span className="muted">Route: {selected.route || '—'}</span><span className="muted">Action: {selected.action || '—'}</span><span className="muted">Request ID: {selected.request_id || '—'}</span><span className="muted">Environment: {selected.environment || '—'} · Version: {selected.app_version || '—'}</span><span className="muted">Platform: {selected.device || '—'} / {selected.browser || '—'} / {selected.os || '—'}</span></div>{selected.stack_trace && <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '18rem', overflow: 'auto' }}>{selected.stack_trace}</pre>}<details><summary>Metadata</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: '18rem', overflow: 'auto' }}>{safeDetail(selected.metadata)}</pre></details><div className="row"><Button variant="secondary" onClick={() => void copyDetails()}>Copy details</Button>{!selected.resolved && <Button onClick={() => void resolve(selected)}>Mark resolved</Button>}</div></div>}</Sheet>
    </>
  );
}
