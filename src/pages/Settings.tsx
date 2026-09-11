import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { LANGUAGES } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useVoice } from '@/hooks/useVoice';
import { useToast } from '@/hooks/useToast';
import { getOverallLevel } from '@/services/gameService';
import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Toggle } from '@/components/Toggle';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { authErrorMessage } from '@/services/authService';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { AISettingsCard } from '@/components/AISettingsCard';
import { AI_CHAT_ENABLED } from '@/config/features';
import type { LanguageCode, ThemePreference } from '@/types';
import { approveCaregiverInvite, getPatientShareCode, listPatientCaregiverLinks, revokeCaregiverAccess, setPatientSharing } from '@/services/sharingService';
import type { CaregiverLink } from '@/types';

function sharingErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message);
  }
  return error instanceof Error ? error.message : fallback;
}

export function Settings() {
  const { t } = useI18n();
  const {
    settings,
    setLanguage,
    setVoiceEnabled,
    setAccessibility,
    setRole,
    update,
    logout,
    exitGuest,
  } = useSettings();
  const { say, supported, enabled } = useVoice();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [langOpen, setLangOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState(settings.emergencyContact);
  const [guestBusy, setGuestBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [clearGuestOpen, setClearGuestOpen] = useState(false);
  const [caregiverLinks, setCaregiverLinks] = useState<CaregiverLink[]>([]);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingMessage, setSharingMessage] = useState('');
  const [shareCode, setShareCode] = useState('');
  const [shareCodeLoading, setShareCodeLoading] = useState(false);

  const a11y = settings.accessibility;
  const overallLevel = getOverallLevel();
  const currentLang =
    LANGUAGES.find((l) => l.code === settings.language) ?? LANGUAGES[0];

  useEffect(() => {
    if (settings.role !== 'patient' || !settings.authenticated || settings.guestMode) return;
    void listPatientCaregiverLinks().then(setCaregiverLinks).catch(() => setSharingMessage('Sharing requests could not be loaded.'));
    if (settings.activePatientId) {
      setShareCodeLoading(true);
      void getPatientShareCode().then(setShareCode).catch(() => setSharingMessage('Your connection code could not be loaded.')).finally(() => setShareCodeLoading(false));
    }
  }, [settings.role, settings.authenticated, settings.guestMode, settings.activePatientId]);

  const readScreen = `${t('settings.title')}. ${t('settings.subtitle')}`;

  const testVoice = () => {
    if (!supported) {
      showToast(t('voice.notAvailable'), '🔈');
      return;
    }
    if (!enabled) {
      showToast(t('settings.voiceGuidance') + ': ' + t('settings.off'), '🔈');
      return;
    }
    say(t('voice.welcome'));
  };

  const chooseLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setLangOpen(false);
    showToast(t('settings.changeLanguage'), '🌐');
  };

  const saveContact = () => {
    update({ emergencyContact: contactDraft.trim() || settings.emergencyContact });
    setContactOpen(false);
    showToast(t('common.save'), '✓');
  };

  const changeSharing = async (enabled: boolean) => {
    const previous = settings.shareWithCaregiver;
    update({ shareWithCaregiver: enabled });
    if (!settings.activePatientId || settings.guestMode) return;
    setSharingBusy(true);
    setSharingMessage('');
    try {
      await setPatientSharing(settings.activePatientId, enabled);
      if (!enabled) {
        await Promise.all(caregiverLinks.filter((link) => link.status !== 'revoked').map((link) => revokeCaregiverAccess(link)));
        setCaregiverLinks((links) => links.map((link) => ({ ...link, status: 'revoked' })));
      }
    } catch (error) {
      update({ shareWithCaregiver: previous });
      setSharingMessage(sharingErrorMessage(error, 'Sharing could not be updated.'));
    } finally {
      setSharingBusy(false);
    }
  };

  const approveInvite = async (link: CaregiverLink) => {
    if (!settings.shareWithCaregiver) {
      setSharingMessage('Turn on sharing before approving an invitation.');
      return;
    }
    setSharingBusy(true);
    setSharingMessage('');
    try {
      await approveCaregiverInvite(link);
      setCaregiverLinks((links) => links.map((item) => item.id === link.id ? { ...item, status: 'active' } : item));
    } catch (error) {
      setSharingMessage(sharingErrorMessage(error, 'The invitation could not be approved.'));
    } finally {
      setSharingBusy(false);
    }
  };

  const copyShareCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      showToast('Connection code copied.', '✓');
    } catch {
      showToast(`Your connection code is ${shareCode}.`, '🔐');
    }
  };

  const openCaregiver = () => {
    setRole('caregiver');
    navigate('/caregiver');
  };

  const leaveGuestMode = async (clearData: boolean) => {
    setGuestBusy(true);
    try {
      await exitGuest(clearData);
      navigate('/');
    } finally {
      setGuestBusy(false);
    }
  };

  const upgradeGuestMode = async () => {
    setGuestBusy(true);
    try {
      // Retain the local demo namespace, but leave Guest Mode before entering
      // the real auth screen so a refresh cannot reopen the guest session.
      await exitGuest(false);
      navigate('/auth');
    } finally {
      setGuestBusy(false);
    }
  };

  const signOutAccount = async () => {
    setLogoutBusy(true);
    setAccountError('');
    try {
      await logout();
      navigate('/', { replace: true });
    } catch (reason) {
      setAccountError(authErrorMessage(reason, 'Unable to sign out. Please try again.'));
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <>
      <AppHeader subtitle={t('nav.settings')} readText={readScreen} />
      <main className="page">
        <div className="stack-lg">
          <div>
            <h1 className="page-title">{t('settings.title')}</h1>
            <p className="page-sub">{t('settings.subtitle')}</p>
          </div>

          {/* Spoken help */}
          <Card variant="tint" padLg>
            <div className="row" style={{ gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span className="mobile-row__icon" aria-hidden="true">
                <Icon name="volume" size={24} />
              </span>
              <div>
                <h2 className="card-title">{t('settings.spokenHelpTitle')}</h2>
                <p className="muted">{t('settings.spokenHelpBody')}</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>{t('settings.voiceGuidance')}</strong>
                <div className="muted">{t('settings.voiceGuidanceDesc')}</div>
              </div>
              <Toggle
                checked={settings.voiceEnabled}
                onChange={setVoiceEnabled}
                label={t('settings.voiceGuidance')}
                onText={t('settings.on')}
                offText={t('settings.off')}
              />
            </div>
            <Button
              variant="audio"
              icon="volume"
              block
              onClick={testVoice}
              style={{ marginTop: '0.75rem' }}
            >
              {t('settings.testVoice')}
            </Button>
          </Card>

          {AI_CHAT_ENABLED && <AISettingsCard />}

          {settings.guestMode && <Card className="guest-settings-card" variant="tint" padLg>
            <div className="row" style={{ gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span className="mobile-row__icon" aria-hidden="true"><Icon name="leaf" size={24} /></span>
              <div><h2 className="card-title">{t('settings.guestModeTitle')}</h2><p className="muted">{t('settings.guestModeBody')}</p></div>
            </div>
            <div className="stack-sm">
              <Button variant="primary" block onClick={() => void upgradeGuestMode()} disabled={guestBusy}>{t('settings.createAccount')}</Button>
              <Button variant="ghost" block onClick={() => void leaveGuestMode(false)} disabled={guestBusy}>{t('settings.exitGuest')}</Button>
              <Button variant="ghost" block onClick={() => setClearGuestOpen(true)} disabled={guestBusy}>{t('settings.clearGuest')}</Button>
            </div>
          </Card>}

          <section aria-labelledby="your-space-title">
            <div className="row-between" style={{ marginBottom: '0.5rem' }}>
              <h2 id="your-space-title" className="section-title">{t('settings.yourSpace')}</h2>
            </div>
            <button type="button" className="link-row" onClick={() => navigate('/progress')}>
              <div className="row" style={{ gap: '0.7rem' }}>
                <span className="mobile-row__icon" aria-hidden="true"><Icon name="heart" size={22} /></span>
                <div><strong>{t('settings.progressSnapshot')}</strong><div className="muted">{t('settings.progressSnapshotDesc')}</div></div>
              </div>
              <Icon name="chevron-right" size={22} />
            </button>
          </section>

          {/* Display & touch */}
          <section>
            <div className="row-between" style={{ marginBottom: '0.5rem' }}>
              <h2 className="section-title">{t('settings.displayTouch')}</h2>
              <span className="muted">{t('settings.tapToToggle')}</span>
            </div>
            <Card>
              <div className="setting-row">
                <div className="row" style={{ gap: '0.6rem' }}>
                  <Icon name="text-size" size={22} />
                  <div>
                    <strong>{t('settings.largeText')}</strong>
                    <div className="muted">{t('settings.largeTextDesc')}</div>
                  </div>
                </div>
                <Toggle
                  checked={a11y.largeText}
                  onChange={(v) => setAccessibility({ largeText: v })}
                  label={t('settings.largeText')}
                  onText={t('settings.on')}
                  offText={t('settings.off')}
                />
              </div>
              <div className="setting-row">
                <div className="row" style={{ gap: '0.6rem' }}>
                  <Icon name="hand" size={22} />
                  <div>
                    <strong>{t('settings.jumboButtons')}</strong>
                    <div className="muted">{t('settings.jumboButtonsDesc')}</div>
                  </div>
                </div>
                <Toggle
                  checked={a11y.jumboButtons}
                  onChange={(v) => setAccessibility({ jumboButtons: v })}
                  label={t('settings.jumboButtons')}
                  onText={t('settings.on')}
                  offText={t('settings.off')}
                />
              </div>
              <div className="setting-row">
                <div className="row" style={{ gap: '0.6rem' }}>
                  <Icon name="contrast" size={22} />
                  <div>
                    <strong>{t('settings.highContrast')}</strong>
                    <div className="muted">{t('settings.highContrastDesc')}</div>
                  </div>
                </div>
                <Toggle
                  checked={a11y.highContrast}
                  onChange={(v) => setAccessibility({ highContrast: v })}
                  label={t('settings.highContrast')}
                  onText={t('settings.on')}
                  offText={t('settings.off')}
                />
              </div>
              <div className="setting-row">
                <div className="row" style={{ gap: '0.6rem' }}>
                  <Icon name="motion" size={22} />
                  <div>
                    <strong>{t('settings.reducedMotion')}</strong>
                    <div className="muted">{t('settings.reducedMotionDesc')}</div>
                  </div>
                </div>
                <Toggle
                  checked={a11y.reducedMotion}
                  onChange={(v) => setAccessibility({ reducedMotion: v })}
                  label={t('settings.reducedMotion')}
                  onText={t('settings.on')}
                  offText={t('settings.off')}
                />
              </div>
            </Card>
          </section>

          <Card>
            <h2 className="card-title">{t('settings.appearanceTitle')}</h2>
            <p className="muted">{t('settings.appearanceDesc')}</p>
            <div className="grid-3" style={{ marginTop: '0.75rem' }}>
              {(['system', 'light', 'dark'] as ThemePreference[]).map((theme) => <Button key={theme} variant={settings.theme === theme ? 'secondary' : 'ghost'} onClick={() => update({ theme })}>{t(`settings.theme${theme[0].toUpperCase()}${theme.slice(1)}`)}</Button>)}
            </div>
          </Card>

          {/* Language */}
          <Card>
            <button
              type="button"
              className="link-row"
              onClick={() => setLangOpen(true)}
            >
              <div className="row" style={{ gap: '0.6rem' }}>
                <Icon name="translate" size={22} />
                <div>
                  <strong>{t('settings.languageTitle')}</strong>
                  <div className="muted">
                    {currentLang.native} · {currentLang.english}
                  </div>
                </div>
              </div>
              <Icon name="chevron-right" size={22} />
            </button>
          </Card>

          {/* Difficulty (auto-adaptive, read-only) */}
          <Card>
            <div className="row" style={{ gap: '0.6rem' }}>
              <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>
                🎯
              </span>
              <div style={{ flex: 1 }}>
                <strong>{t('settings.difficultyTitle')}</strong>
                <div className="muted">{t('settings.difficultyDesc')}</div>
              </div>
              <span className="pill pill--green">
                {t('home.level')} {overallLevel}
              </span>
            </div>
          </Card>

          {/* Emergency contact */}
          <Card>
            <button
              type="button"
              className="link-row"
              onClick={() => {
                setContactDraft(settings.emergencyContact);
                setContactOpen(true);
              }}
            >
              <div className="row" style={{ gap: '0.6rem' }}>
                <Icon name="phone" size={22} />
                <div>
                  <strong>{t('settings.emergencyTitle')}</strong>
                  <div className="muted">{settings.emergencyContact}</div>
                </div>
              </div>
              <Icon name="edit" size={20} />
            </button>
          </Card>

          {/* Family members */}
          <Card>
            <button type="button" className="link-row" onClick={() => navigate('/profiles')}>
              <div><strong>{t('settings.patientProfiles')}</strong><div className="muted">{t('settings.patientProfilesDesc')}</div></div><Icon name="chevron-right" size={20} />
            </button>
            <button type="button" className="link-row" onClick={() => navigate('/people')}>
              <div><strong>{t('settings.myPeople')}</strong><div className="muted">{t('settings.myPeopleDesc')}</div></div><Icon name="chevron-right" size={20} />
            </button>
          </Card>
          <Card>
            <button type="button" className="link-row" onClick={() => navigate('/people')}>
              <div className="row" style={{ gap: '0.6rem' }}><Icon name="users" size={22} /><div><strong>{t('settings.familyMembers')}</strong><div className="muted">{t('settings.familyMembersDesc')}</div></div></div><Icon name="chevron-right" size={20} />
            </button>
          </Card>

          {/* Privacy & sharing */}
          {settings.role === 'patient' && <Card variant="tint" padLg>
            <div className="row" style={{ gap: '0.6rem', marginBottom: '0.5rem' }}>
              <Icon name="shield" size={22} />
              <div>
                <h2 className="card-title">{t('settings.privacyTitle')}</h2>
                <p className="muted">{t('settings.privacyBody')}</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>{t('settings.shareData')}</strong>
                <div className="muted">{t('settings.shareDataDesc')}</div>
              </div>
              <Toggle
                checked={settings.shareWithCaregiver}
                onChange={(v) => void changeSharing(v)}
                label={t('settings.shareData')}
                onText={t('settings.on')}
                offText={t('settings.off')}
                disabled={sharingBusy || settings.guestMode}
              />
            </div>
            <div className="card" style={{ marginTop: '0.9rem' }}>
              <strong>Patient connection code</strong>
              <p className="muted">Give this code only to the caregiver you choose. They must enter it and you must approve their request.</p>
              <div className="row-between" style={{ marginTop: '0.65rem', gap: '0.75rem' }}>
                <code style={{ fontSize: '1.35rem', letterSpacing: '0.16em', fontWeight: 800 }}>{shareCodeLoading ? 'Loading…' : shareCode || 'Unavailable'}</code>
                <Button variant="secondary" onClick={() => void copyShareCode()} disabled={shareCodeLoading || !shareCode}>Copy code</Button>
              </div>
            </div>
            <div className="stack-sm" style={{ marginTop: '0.9rem' }}>
              {caregiverLinks.filter((link) => link.status === 'pending').map((link) => <div className="card row-between" key={link.id}>
                <div><strong>{link.caregiver_name}</strong><div className="muted">wants to support you</div></div>
                <Button onClick={() => void approveInvite(link)} disabled={sharingBusy || !settings.shareWithCaregiver}>Approve</Button>
              </div>)}
              {caregiverLinks.filter((link) => link.status === 'active').map((link) => <div className="row-between" key={link.id}>
                <span><strong>{link.caregiver_name}</strong><small className="muted" style={{ display: 'block' }}>Approved caregiver</small></span>
                <Button variant="ghost" onClick={() => void revokeCaregiverAccess(link).then(() => setCaregiverLinks((links) => links.map((item) => item.id === link.id ? { ...item, status: 'revoked' } : item)))} disabled={sharingBusy}>Stop access</Button>
              </div>)}
              {sharingMessage && <p className="banner banner--amber" role="status">{sharingMessage}</p>}
            </div>
          </Card>}

          {/* Offline status */}
          <Card variant="tint">
            <div className="row-between">
              <div className="row" style={{ gap: '0.6rem' }}>
                <Icon name="wifi-off" size={22} />
                <div>
                  <strong>{t('settings.offlineTitle')}</strong>
                  <div className="muted">{t('settings.offlineBody')}</div>
                </div>
              </div>
              <span className="pill pill--green">{t('settings.offlineReady')}</span>
            </div>
          </Card>

          {/* Open family dashboard */}
          {!settings.guestMode && <Button variant="secondary" icon="users" block size="lg" onClick={openCaregiver}>
            {t('settings.switchToCaregiver')}
          </Button>}

          {!settings.guestMode && settings.authenticated && <Card variant="tint" padLg>
            <div className="stack-sm">
              <div><strong>{t('settings.accountTitle')}</strong><p className="muted">{t('settings.accountDesc')}</p></div>
              <Button variant="ghost" block onClick={() => void signOutAccount()} disabled={logoutBusy}>{logoutBusy ? t('settings.signingOut') : t('settings.signOut')}</Button>
              {accountError && <p className="banner banner--red" role="alert">{accountError}</p>}
            </div>
          </Card>}


          <p className="disclaimer">{t('common.disclaimer')}</p>
          <p className="muted">{t('settings.privacyNotice')}</p>
        </div>
      </main>

      {/* Language sheet */}
      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title={t('settings.changeLanguage')}>
        <div role="radiogroup" aria-label={t('settings.changeLanguage')} className="stack">
          {LANGUAGES.map((l) => {
            const active = l.code === settings.language;
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={active}
                className={`select-row ${active ? 'select-row--active' : ''}`}
                onClick={() => chooseLanguage(l.code)}
              >
                <div>
                  <strong>{l.native}</strong>
                  <div className="muted">{l.english}</div>
                </div>
                {active && <Icon name="check" size={22} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* Emergency contact sheet */}
      <Sheet open={contactOpen} onClose={() => setContactOpen(false)} title={t('settings.emergencyTitle')}>
        <label className="field-label" htmlFor="ec-input">
          {t('settings.emergencyTitle')}
        </label>
        <input
          id="ec-input"
          className="field-input"
          value={contactDraft}
          onChange={(e) => setContactDraft(e.target.value)}
          placeholder="108"
        />
        <div className="sheet-actions">
          <Button variant="ghost" onClick={() => setContactOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button icon="check" onClick={saveContact}>
            {t('common.save')}
          </Button>
        </div>
      </Sheet>

      <ConfirmSheet
        open={clearGuestOpen}
        title={t('settings.clearGuestTitle')}
        message={t('settings.clearGuestBody')}
        confirmLabel={t('settings.clearData')}
        danger
        onClose={() => setClearGuestOpen(false)}
        onConfirm={() => { setClearGuestOpen(false); void leaveGuestMode(true); }}
      />

    </>
  );
}
