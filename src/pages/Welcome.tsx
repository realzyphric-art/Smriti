import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, LANGUAGES } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { greetingKey } from '@/utils/helpers';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { VoiceButton } from '@/components/VoiceButton';
import { Icon } from '@/components/Icon';
import { Toggle } from '@/components/Toggle';
import { biometricStatus, createProfile, registerPasskey, savePin, verifyPasskey, verifyPin } from '@/services/profileService';
import { activeProfileFrom, displayName } from '@/utils/profile';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthPage } from '@/pages/AuthPage';

export function Welcome() {
  const { t } = useI18n();
  const { settings, setVoiceEnabled, setAccessibility, completeOnboarding, updateActiveProfile, update, enterGuest } =
    useSettings();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [patientName, setPatientName] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);

  const greeting = t(`welcome.${greetingKey()}`);
  const readText = `${greeting}. ${t('welcome.headline')} ${t('welcome.subtitle')}`;
  const currentLang = LANGUAGES.find((l) => l.code === settings.language);
  const routeForRole = (role: 'patient' | 'caregiver') => role === 'caregiver' ? '/caregiver' : '/home';

  const startPatient = async () => {
    if (!name.trim() || pin.length < 4) return;
    const patient = await createProfile(name);
    await savePin(pin);
    updateActiveProfile({ id: patient.id, patientName: patient.name, caregiverName: '', role: 'patient' });
    completeOnboarding();
    navigate('/home');
  };
  const startCaregiver = async () => {
    if (!name.trim() || !patientName.trim() || pin.length < 4) return;
    const patient = await createProfile(patientName);
    await savePin(pin);
    updateActiveProfile({ id: patient.id, patientName: patient.name, caregiverName: name.trim(), role: 'caregiver' });
    completeOnboarding();
    navigate('/caregiver');
  };
  const signInWithPin = async () => {
    if (await verifyPin(pin)) { update({ authenticated: true }); navigate(routeForRole(activeProfileFrom(settings).role)); }
    else setAuthMessage('PIN verification failed. Please try again.');
  };
  const signInWithPasskey = async () => {
    try { if (await verifyPasskey()) { update({ authenticated: true }); navigate(routeForRole(activeProfileFrom(settings).role)); } }
    catch { setAuthMessage('Passkey sign-in was cancelled or timed out. You can try again or use your PIN.'); }
  };
  const setupPasskey = async () => {
    try { const profile = activeProfileFrom(settings); await registerPasskey(profile.id, displayName(profile)); setAuthMessage('Passkey set up successfully.'); }
    catch { setAuthMessage('Passkey setup was cancelled or timed out. You can try again or use your PIN.'); }
  };
  const startGuestMode = async () => {
    setGuestLoading(true);
    setAuthMessage('');
    try {
      await enterGuest();
      navigate('/home', { replace: true });
    } catch {
      setGuestLoading(false);
      setAuthMessage('Unable to start Guest Mode. Your local data was not changed.');
    }
  };

  if (isSupabaseConfigured) return <AuthPage />;

  if (settings.onboarded && !settings.authenticated) {
    return (
      <>
        <AppHeader />
        <main className="page page--flow auth-page">
          <div className="stack-sm text-center">
            <h1>Welcome back, {displayName(activeProfileFrom(settings))}</h1>
            <p className="text-muted">Sign in on this device.</p>
          </div>
          <div className="card stack-sm auth-card">
            <label className="field__label" htmlFor="sign-in-pin">PIN</label>
            <input id="sign-in-pin" className="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" />
            <Button block onClick={signInWithPin}>Use PIN instead</Button>
            {biometricStatus() === 'supported' ? <>
              <Button variant="secondary" block onClick={() => void signInWithPasskey()}>Sign in with Face ID / Passkey</Button>
              <Button variant="ghost" block onClick={() => void setupPasskey()}>Set up Face ID / Passkey</Button>
            </> : <p className="muted">Face ID / passkeys are unavailable in this browser or context. Use your PIN instead.</p>}
            {authMessage && <p role="status" className="muted">{authMessage}</p>}
            <div className="auth-divider" role="separator"><span>or</span></div>
            <div className="stack-sm">
              <Button type="button" size="lg" block variant="secondary" onClick={() => void startGuestMode()} disabled={guestLoading}>
                {guestLoading ? 'Opening Guest Mode…' : 'Continue as Guest'}
              </Button>
              <p className="muted text-center">Try Smriti without creating an account. Your demo data stays on this device.</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader readText={readText} />
      <main className="page page--flow">
        <div className="welcome-hero card">
          <img src="/stitch-memorycare-portrait.png" alt="A smiling older woman in a warm home" />
          <div className="welcome-hero__caption">
            <Icon name="leaf" size={18} /> {t('welcome.pacedForYou')}
          </div>
        </div>

        <div className="stack-sm text-center">
          <h1 style={{ fontSize: 'var(--fs-display)' }}>{t('welcome.headline')}</h1>
          <p className="text-muted" style={{ fontSize: 'var(--fs-body-lg)' }}>
            {t('welcome.subtitle')}
          </p>
        </div>

        <div className="card stack-sm">
          <label className="field__label" htmlFor="onboard-name">Your name</label>
          <input id="onboard-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" autoComplete="name" />
          <label className="field__label" htmlFor="onboard-patient">Patient name (for caregiver setup)</label>
          <input id="onboard-patient" className="input" value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder="Enter the patient’s name" autoComplete="name" />
          <label className="field__label" htmlFor="onboard-pin">Choose a 4+ digit demo PIN</label>
          <input id="onboard-pin" className="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" minLength={4} placeholder="••••" />
          <small className="muted">{biometricStatus() === 'supported' ? 'A passkey can be set up after onboarding. PIN remains available as a fallback.' : 'Passkeys are unavailable in this browser or context. Use your local demo PIN.'}</small>
        </div>


        <div className="stack-sm">
          <Button variant="primary" size="lg" block icon="play" onClick={startPatient} disabled={!name.trim() || pin.length < 4}>
            {isSupabaseConfigured ? 'Create patient account' : t('welcome.getStarted')}
          </Button>
          <Button variant="secondary" size="lg" block icon="users" onClick={startCaregiver} disabled={!name.trim() || !patientName.trim() || pin.length < 4}>
            {isSupabaseConfigured ? 'Create caregiver account' : t('welcome.iAmCaregiver')}
          </Button>
        </div>

        <div className="auth-divider" role="separator"><span>or</span></div>
        <div className="stack-sm">
          <Button type="button" size="lg" block variant="secondary" onClick={() => void startGuestMode()} disabled={guestLoading}>
            {guestLoading ? 'Opening Guest Mode…' : 'Continue as Guest'}
          </Button>
              <p className="muted text-center">Try Smriti without creating an account. Your demo data stays on this device.</p>
        </div>

        {/* Helpful settings */}
        <div className="stack-sm">
          <div className="eyebrow">{t('welcome.helpfulSettings')}</div>

          <button className="setting-row" onClick={() => navigate('/language')}>
            <span className="medallion medallion--amber" aria-hidden="true">
              <Icon name="translate" size={26} />
            </span>
            <span className="setting-row__body">
              <span className="setting-row__title">{t('welcome.language')}</span>
              <span className="setting-row__desc">{currentLang?.native}</span>
            </span>
            <Icon name="chevron-right" size={22} />
          </button>

          <div className="setting-row">
            <span className="medallion medallion--green" aria-hidden="true">
              <Icon name="volume" size={26} />
            </span>
            <span className="setting-row__body">
              <span className="setting-row__title">{t('welcome.voicePrompt')}</span>
              <span className="setting-row__desc">
                {settings.voiceEnabled ? t('settings.on') : t('settings.off')}
              </span>
            </span>
            <Toggle
              checked={settings.voiceEnabled}
              onChange={setVoiceEnabled}
              label={t('welcome.voicePrompt')}
              onText={t('settings.on')}
              offText={t('settings.off')}
            />
          </div>

          <div className="setting-row">
            <span className="medallion medallion--soft" aria-hidden="true">
              <Icon name="text-size" size={26} />
            </span>
            <span className="setting-row__body">
              <span className="setting-row__title">{t('welcome.display')}</span>
              <span className="setting-row__desc">{t('welcome.easyView')}</span>
            </span>
            <Toggle
              checked={settings.accessibility.largeText}
              onChange={(v) => setAccessibility({ largeText: v })}
              label={t('settings.largeText')}
              onText={t('settings.on')}
              offText={t('settings.off')}
            />
          </div>
        </div>

        <VoiceButton text={readText} label={t('common.listen')} />

        <div className="banner banner--soft" style={{ fontSize: 'var(--fs-caption)' }}>
          <Icon name="shield" size={20} />
          <span>{t('common.disclaimer')}</span>
        </div>
      </main>
    </>
  );
}
