import type { Reminder } from '@/types';
import { useI18n } from '@/i18n';
import { formatTime } from '@/services/reminderService';
import { Icon } from './Icon';

interface ReminderCardProps {
  reminder: Reminder;
  status: 'now' | 'upcoming' | 'done' | 'default';
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const statusLabel: Record<string, string> = {
  now: 'reminders.rightNow',
  upcoming: 'reminders.upcoming',
  done: 'reminders.completed',
  default: '',
};

export function ReminderCard({
  reminder,
  status,
  onToggle,
  onEdit,
  onDelete,
}: ReminderCardProps) {
  const { t } = useI18n();
  const isDone = reminder.completed;

  const medallionTone =
    status === 'now'
      ? 'medallion--amber'
      : isDone
        ? 'medallion--green'
        : 'medallion--soft';

  return (
    <div
      className={`reminder-card stack-sm ${isDone ? 'is-done' : ''} ${status === 'now' ? 'is-now' : ''}`}
      style={
        status === 'now'
          ? { borderColor: 'var(--primary-container)', borderWidth: 2 }
          : undefined
      }
    >
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className={`medallion ${medallionTone}`} aria-hidden="true">
          <Icon name={status === 'now' ? 'sun' : isDone ? 'check' : 'clock'} size={24} />
        </span>
        <div className="grow">
          {statusLabel[status] && (
            <div className="eyebrow" style={{ color: 'var(--on-primary-fixed)' }}>
              {t(statusLabel[status])} • {formatTime(reminder.time)}
            </div>
          )}
          <h3 className={isDone ? 'strike' : ''}>{reminder.title}</h3>
          {reminder.detail && (
            <p className="text-muted" style={{ fontSize: 'var(--fs-body)' }}>
              {reminder.detail}
            </p>
          )}
        </div>
        <div className="stack-sm" style={{ gap: '0.4rem' }}>
          {onEdit && (
            <button
              type="button"
              className="medallion medallion--soft"
              style={{ width: '2.6rem', height: '2.6rem' }}
              aria-label={`${t('common.edit')} ${reminder.title}`}
              onClick={onEdit}
            >
              <Icon name="edit" size={20} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="medallion medallion--red"
              style={{ width: '2.6rem', height: '2.6rem' }}
              aria-label={`${t('common.delete')} ${reminder.title}`}
              onClick={onDelete}
            >
              <Icon name="trash" size={20} />
            </button>
          )}
        </div>
      </div>

      {isDone ? (
        <div className="banner banner--green" style={{ padding: '0.75rem 1rem' }}>
          <Icon name="check" size={22} strokeWidth={3} />
          <span style={{ fontWeight: 700 }}>
            {t('reminders.takenAt')}{' '}
            {reminder.completedAt
              ? new Date(reminder.completedAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : ''}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={`btn ${status === 'now' ? 'btn--warn' : 'btn--secondary'} btn--block`}
          onClick={onToggle}
        >
          <Icon name="check" size={22} />
          <span>{t('reminders.markDone')}</span>
        </button>
      )}
    </div>
  );
}
