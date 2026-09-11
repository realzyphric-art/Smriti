import { useMemo, useState } from 'react';
import type { Reminder } from '@/types';
import { useI18n } from '@/i18n';
import { useReminders } from '@/hooks/useReminders';
import { useToast } from '@/hooks/useToast';
import { AppHeader } from '@/components/AppHeader';
import { VoiceButton } from '@/components/VoiceButton';
import { ReminderCard } from '@/components/ReminderCard';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Toggle } from '@/components/Toggle';
import { formatTime, reminderStatus } from '@/services/reminderService';
import { localDateKey } from '@/utils/date';
import { ListSkeleton } from '@/components/Skeleton';
import { ContentState } from '@/components/ContentState';
import { ConfirmSheet } from '@/components/ConfirmSheet';

const ICON_CHOICES = ['💊', '💧', '🍎', '📞', '🚶', '🧘', '☀️', '🌙', '📖', '🪥'];

function statusFor(r: Reminder): 'now' | 'upcoming' | 'done' | 'default' {
  const state = reminderStatus(r);
  if (state === 'completed') return 'done';
  if (state === 'due') return 'now';
  if (state === 'missed') return 'default';
  return 'upcoming';
}

export function Reminders() {
  const { t } = useI18n();
  const { reminders, completedCount, toggle, add, edit, remove, loading, error, reload } = useReminders();
  const { showToast } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState<Reminder | null>(null);

  const todaysReminders = reminders.filter((reminder) => reminder.recurring || !reminder.scheduledDate || reminder.scheduledDate === localDateKey());
  const total = todaysReminders.length;
  const readAll = useMemo(
    () =>
      `${t('reminders.title')}. ` +
      todaysReminders.map((r) => `${r.title}, ${formatTime(r.time)}.`).join(' '),
    [todaysReminders, t],
  );

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (r: Reminder) => {
    setEditing(r);
    setSheetOpen(true);
  };

  const handleDelete = (r: Reminder) => {
    setDeleting(r);
  };
  const requestNotifications = async () => {
    if (!('Notification' in window)) return showToast(t('reminders.notificationsUnsupported'), 'ℹ️');
    const permission = await Notification.requestPermission();
    showToast(permission === 'granted' ? t('reminders.notificationsEnabled') : t('reminders.notificationsDenied'), permission === 'granted' ? '🔔' : 'ℹ️');
  };

  return (
    <>
      <AppHeader subtitle={t('nav.reminders')} readText={readAll} />
      <main className="page">
        <div className="banner banner--amber stack-sm" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="row">
            <Icon name="sun" size={24} />
            <div>
              <strong style={{ fontSize: 'var(--fs-h3)' }}>{t('reminders.title')}</strong>
              <div style={{ fontSize: 'var(--fs-caption)' }}>{t('reminders.subtitle')}</div>
            </div>
          </div>
          <VoiceButton text={readAll} label={t('reminders.readAloud')} />
        </div>
        <p className="muted" style={{ fontSize: 'var(--fs-caption)' }}>{t('reminders.browserNotice')}</p>
        <Button variant="ghost" icon="bell" block onClick={requestNotifications}>{t('reminders.enableNotifications')}</Button>
        {error && <ContentState title="Reminders are unavailable" detail={error} tone="amber" action={{ label: 'Try again', onClick: () => void reload() }} />}

        {/* Progress */}
        <div className="stack-sm">
          <div className="row-between">
            <span style={{ fontWeight: 700 }}>{t('reminders.gentleProgress')}</span>
            <span className="pill-count">
              {completedCount} / {total} {t('reminders.completedCount')}
            </span>
          </div>
          <div className="bar">
            <div
              className="bar__fill"
              style={{ width: `${total ? (completedCount / total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {loading ? <ListSkeleton count={3} /> : total === 0 ? (
          <div className="card stack text-center" style={{ padding: 'var(--space-xl)' }}>
            <div style={{ fontSize: '3rem' }} aria-hidden="true">
              🔔
            </div>
            <h2>{t('reminders.emptyTitle')}</h2>
            <p className="text-muted">{t('reminders.emptyBody')}</p>
          </div>
        ) : (
          <div className="reminder-timeline">
            {todaysReminders.map((r) => (
              <ReminderCard
                key={r.id}
                reminder={r}
                status={statusFor(r)}
                onToggle={() => toggle(r)}
                onEdit={() => openEdit(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        )}

        <Button variant="secondary" size="lg" block icon="plus" onClick={openAdd}>
          {t('reminders.addNew')}
        </Button>

        <div className="banner banner--soft" style={{ fontSize: 'var(--fs-caption)' }}>
          <Icon name="bell" size={20} />
          <span>{t('reminders.footerNote')}</span>
        </div>
      </main>

      <ReminderSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => setSheetOpen(false)}
        onSave={async (data) => {
          if (editing) {
            await edit({ ...editing, ...data });
            showToast(t('common.save'), '✓');
          } else {
            await add({ ...data, recurring: data.recurring });
            showToast(t('common.add'), '✓');
          }
          setSheetOpen(false);
        }}
      />
      <ConfirmSheet
        open={Boolean(deleting)}
        title={t('reminders.deleteTitle')}
        message={t('reminders.deleteConfirm')}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            remove(deleting.id);
            showToast(t('common.done'), '✓');
          }
          setDeleting(null);
        }}
      />
    </>
  );
}

interface SheetData {
  title: string;
  detail: string;
  time: string;
  icon: string;
  recurring: boolean;
  category: Reminder['category'];
  enabled: boolean;
  scheduledDate?: string;
}

function ReminderSheet({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: Reminder | null;
  onClose: () => void;
  onSave: (data: SheetData) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [time, setTime] = useState('09:00');
  const [icon, setIcon] = useState('💊');
  const [recurring, setRecurring] = useState(true);
  const [category, setCategory] = useState<Reminder['category']>('medicine');
  const [enabled, setEnabled] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');

  // Sync fields when opening / switching target.
  const [lastId, setLastId] = useState<string | null>(null);
  const targetId = editing?.id ?? null;
  if (open && targetId !== lastId) {
    setLastId(targetId);
    setTitle(editing?.title ?? '');
    setDetail(editing?.detail ?? '');
    setTime(editing?.time ?? '09:00');
    setIcon(editing?.icon ?? '💊');
    setRecurring(editing?.recurring ?? true);
    setCategory(editing?.category ?? 'medicine');
    setEnabled(editing?.enabled ?? true);
    setScheduledDate(editing?.scheduledDate ?? new Date().toISOString().slice(0, 10));
  }
  if (!open && lastId !== null) setLastId(null);

  const canSave = title.trim().length > 0;

  return (
    <Sheet
      open={open}
      title={editing ? t('reminders.editTitle') : t('reminders.addTitle')}
      onClose={onClose}
    >
      <div className="stack">
        <div className="field">
          <label className="field__label" htmlFor="r-title">
            {t('reminders.nameLabel')}
          </label>
          <input
            id="r-title"
            className="input"
            value={title}
            placeholder={t('reminders.namePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="r-category">{t('reminders.category')}</label>
          <select id="r-category" className="input" value={category} onChange={(event) => setCategory(event.target.value as Reminder['category'])}>
            {(['medicine', 'meal', 'water', 'appointment', 'exercise', 'game', 'custom'] as const).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="r-detail">
            {t('reminders.detailLabel')}
          </label>
          <input
            id="r-detail"
            className="input"
            value={detail}
            placeholder={t('reminders.detailPlaceholder')}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="r-time">
            {t('reminders.timeLabel')}
          </label>
          <input
            id="r-time"
            type="time"
            className="input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="field__label">{t('reminders.iconLabel')}</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            {ICON_CHOICES.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setIcon(ic)}
                aria-label={ic}
                aria-pressed={icon === ic}
                className="medallion"
                style={{
                  fontSize: '1.5rem',
                  background:
                    icon === ic ? 'var(--secondary-container)' : 'var(--surface-container-high)',
                  border: icon === ic ? '2px solid var(--secondary)' : '2px solid transparent',
                }}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>

        <div className="setting-row" style={{ border: 'none', background: 'var(--surface-container)' }}>
          <span className="setting-row__body">
            <span className="setting-row__title">{t('reminders.recurringLabel')}</span>
          </span>
          <Toggle
            checked={recurring}
            onChange={setRecurring}
            label={t('reminders.recurringLabel')}
            onText={t('common.yes')}
            offText={t('common.no')}
          />
        </div>
        {!recurring && <div className="field"><label className="field__label" htmlFor="r-date">{t('reminders.date')}</label><input id="r-date" type="date" className="input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} /></div>}
        <div className="setting-row" style={{ border: 'none', background: 'var(--surface-container)' }}>
          <span className="setting-row__title">{t('reminders.enabled')}</span>
          <Toggle checked={enabled} onChange={setEnabled} label={t('reminders.enabled')} onText={t('settings.on')} offText={t('settings.off')} />
        </div>

        <Button
          variant="primary"
          size="lg"
          block
          icon="check"
          disabled={!canSave}
          onClick={() =>
            onSave({ title: title.trim(), detail: detail.trim(), time, icon, recurring, category, enabled, scheduledDate: recurring ? undefined : scheduledDate })
          }
        >
          {t('reminders.saveReminder')}
        </Button>
      </div>
    </Sheet>
  );
}
