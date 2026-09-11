import { useEffect, useRef } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useToast } from '@/hooks/useToast';
import { useI18n } from '@/i18n';
import { syncNow } from '@/services/syncService';
import { Icon } from './Icon';

/** Shows a calm offline card; when connectivity returns, flushes sync + toasts. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { showToast } = useToast();
  const { t } = useI18n();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (online) {
      void syncNow().then((res) => { if (res.synced > 0) showToast(`${res.synced} change${res.synced === 1 ? '' : 's'} synced.`, '✓'); });
    }
  }, []);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      syncNow().then((res) => {
        if (res.synced > 0) showToast(t('offline.synced'), '✓');
      });
    }
  }, [online, showToast, t]);

  if (online) return null;

  return (
    <div className="banner banner--amber" role="status" aria-live="polite">
      <Icon name="wifi-off" size={24} />
      <div>
        <strong>{t('offline.youreOffline')}</strong>
        <div style={{ fontSize: 'var(--fs-caption)' }}>{t('offline.dontWorry')}</div>
      </div>
    </div>
  );
}
