import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { Icon } from './Icon';
import { VoiceButton } from './VoiceButton';
import { activeProfileFrom, avatarInitial, displayName } from '@/utils/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { listAuthorizedPatients, patientPhotoUrl } from '@/services/patientService';
import { profiles } from '@/services/profileService';

interface AppHeaderProps {
  /** Small label under the brand, e.g. "Home". */
  subtitle?: string;
  /** If set, the header shows a "Read Screen" control that speaks this text. */
  readText?: string;
  /** Show a back button on the left. */
  showBack?: boolean;
  onBack?: () => void;
}

export function AppHeader({ subtitle, readText, showBack, onBack }: AppHeaderProps) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const name = displayName(activeProfileFrom(settings));
  const initial = avatarInitial(name);
  const [photoUrl, setPhotoUrl] = useState<string | null>(settings.activeProfile?.avatarUrl ?? null);

  useEffect(() => {
    let live = true;
    const loadPhoto = async () => {
      if (!settings.activePatientId) {
        setPhotoUrl(null);
        return;
      }
      try {
        if (settings.guestMode || !isSupabaseConfigured) {
          const localProfile = (await profiles()).find((profile) => profile.id === settings.activePatientId);
          if (live) setPhotoUrl(localProfile?.profilePhotoUrl ?? null);
          return;
        }
        const patient = (await listAuthorizedPatients()).find((candidate) => candidate.id === settings.activePatientId);
        const url = await patientPhotoUrl(patient?.profile_photo_path ?? null);
        if (live) setPhotoUrl(url);
      } catch {
        if (live) setPhotoUrl(null);
      }
    };
    void loadPhoto();
    return () => { live = false; };
  }, [settings.activePatientId, settings.guestMode, settings.authenticated, settings.activeProfile?.avatarUrl]);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="brand">
          {showBack ? (
            <button
              type="button"
              className="brand__logo"
              onClick={onBack ?? (() => navigate(-1))}
              aria-label={t('common.back')}
            >
              <Icon name="arrow-left" size={24} />
            </button>
          ) : (
            <span className="brand__logo" aria-hidden="true">
              <Icon name="leaf" size={22} />
            </span>
          )}
          <div>
            <div className="brand__name">{t('common.appName')}</div>
            {(subtitle || settings.guestMode) && <div className="brand__sub">{subtitle}{settings.guestMode && <span className="guest-badge">{t('common.guestMode')}</span>}</div>}
          </div>
        </div>

        <div className="row" style={{ gap: '0.5rem' }}>
          {readText && (
            <VoiceButton text={readText} label={t('common.readScreen')} compact />
          )}
          <span
            aria-label={`${name} profile`}
            role="img"
            style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '9999px',
              background: 'var(--secondary-container)',
              color: 'var(--secondary-dark)',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontFamily: 'var(--font-head)',
              flexShrink: 0,
            }}
          >
            {photoUrl ? <img src={photoUrl} alt={`${name} profile`} width="40" height="40" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} /> : initial}
          </span>
        </div>
      </div>
    </header>
  );
}
