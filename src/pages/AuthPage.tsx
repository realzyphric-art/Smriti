import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { PasswordField } from '@/components/PasswordField';
import { Icon } from '@/components/Icon';
import { useSettings } from '@/hooks/useSettings';
import { useI18n } from '@/i18n';
import {
  authErrorMessage,
  isStrongEnoughPassword,
  isValidUsername,
  signInWithGoogle,
  signIn,
  signUp,
  signOut,
} from '@/services/authService';

type AuthMode = 'sign-in' | 'sign-up';

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, setVoiceEnabled, setAccessibility, enterGuest, refreshAuth } = useSettings();
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [message, setMessage] = useState(() => (location.state as { resetComplete?: boolean } | null)?.resetComplete ? 'Your password was updated. You can sign in with it now.' : '');
  const [error, setError] = useState('');

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setMessage('');
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setMessage('');
    setError('');
    const normalizedUsername = username.trim().toLowerCase();
    if (!isValidUsername(normalizedUsername)) {
      setError(t('auth.invalidUsername'));
      return;
    }
    if (mode === 'sign-up') {
      if (!name.trim()) {
        setError(t('auth.enterName'));
        return;
      }
      if (!isStrongEnoughPassword(password)) {
        setError(t('auth.passwordRequirements'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('auth.passwordsMismatch'));
        return;
      }
    } else if (!password) {
      setError(t('auth.enterPassword'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const result = await signUp(normalizedUsername, password, name || normalizedUsername);
        if (!result.session) throw new Error('Disable Supabase email confirmation for username-only hackathon mode.');
        if (!await refreshAuth()) {
          await signOut().catch(() => undefined);
          throw new Error('Your account was created, but its Smriti profile could not be loaded. Please ask an administrator to check the account setup.');
        }
      } else {
        await signIn(normalizedUsername, password);
        if (!await refreshAuth()) {
          await signOut().catch(() => undefined);
          throw new Error('Your password was accepted, but your Smriti profile could not be loaded. Please try again or ask an administrator to check the account.');
        }
      }
      navigate('/', { replace: true });
    } catch (reason) {
      setError(authErrorMessage(reason, mode === 'sign-up' ? 'Unable to create your account.' : 'Unable to sign in.'));
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    setGoogleLoading(true);
    setMessage('');
    setError('');
    try {
      await signInWithGoogle();
    } catch (reason) {
      setError(authErrorMessage(reason, 'Unable to start Google sign-in.'));
      setGoogleLoading(false);
    }
  };

  const guestLogin = async () => {
    setGuestLoading(true);
    setMessage('');
    setError('');
    try {
      await enterGuest();
      navigate('/home', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start Guest Mode.');
      setGuestLoading(false);
    }
  };

  const heading = mode === 'sign-up' ? t('auth.signUpTitle') : t('auth.signInTitle');
  const submitLabel = mode === 'sign-up' ? t('auth.createAccount') : t('common.continue');

  return (
    <>
      <AppHeader />
      <main className="page page--flow auth-page">
        <section className="auth-hero text-center" aria-labelledby="auth-title">
          <div className="auth-hero__icon" aria-hidden="true"><Icon name="leaf" size={34} /></div>
          <p className="eyebrow">Smriti</p>
          <h1 id="auth-title">{heading}</h1>
          <p className="page-sub">{t('auth.subtitle')}</p>
        </section>

        <section className="card auth-card stack-lg" aria-label="Authentication options">
          <>
            <div className="stack-sm">
              <h2 className="card-title">{t('auth.useGoogle')}</h2>
              <p className="muted">{t('auth.continueGoogle')}</p>
              <Button type="button" size="lg" block variant="secondary" onClick={() => void googleLogin()} disabled={busy || googleLoading}>
                {googleLoading ? t('auth.openingGoogle') : t('auth.continueGoogle')}
              </Button>
            </div>
            <div className="auth-divider" role="separator"><span>{t('auth.usernameOr')}</span></div>
          </>

          <form className="stack" onSubmit={(event) => void submit(event)} noValidate>
            <div className="stack-sm">
              <h2 className="card-title">{t('auth.usernamePassword')}</h2>
              {mode === 'sign-up' && <div className="field"><label className="field__label" htmlFor="auth-name">{t('auth.name')}</label><input id="auth-name" className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>}
              <div className="field"><label className="field__label" htmlFor="auth-username">{t('auth.username')}</label><input id="auth-username" className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" autoFocus /></div>
              {(mode === 'sign-up' || mode === 'sign-in') && <>
                <PasswordField id="auth-password" label={t('auth.password')} value={password} onChange={setPassword} autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />
                {mode === 'sign-up' && <>
                  <PasswordField id="auth-confirm-password" label={t('auth.confirmPassword')} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
                  <p className="muted">{t('auth.passwordRequirements')}</p>
                </>}
              </>}
            </div>
            <Button type="submit" size="lg" block disabled={busy}>{busy ? t('auth.pleaseWait') : submitLabel}</Button>
          </form>

          {mode === 'sign-in' && (
            <aside className="auth-help" aria-label={t('auth.signInHelpTitle')}>
              <div className="auth-help__heading"><span aria-hidden="true">?</span><strong>{t('auth.signInHelpTitle')}</strong></div>
              <p className="muted">{t('auth.signInHelpBody')}</p>
              <p className="muted">{t('auth.signInHelpSteps')}</p>
            </aside>
          )}

          <><div className="auth-divider" role="separator"><span>{t('auth.tryMemoryCare')}</span></div>
            <div className="stack-sm">
              <Button type="button" size="lg" block variant="ghost" onClick={() => void guestLogin()} disabled={busy || googleLoading || guestLoading}>
                {guestLoading ? t('auth.openingGuest') : t('auth.guest')}
              </Button>
              <p className="muted text-center">{t('auth.guestBody')}</p>
            </div></>

          {error && <p className="banner banner--red" role="alert">{error}</p>}
          {message && <p className="banner banner--green" role="status" aria-live="polite">{message}</p>}

          <div className="auth-links">
            {mode === 'sign-in' && <p className="muted">{t('auth.newHere')} <button type="button" className="auth-link" onClick={() => switchMode('sign-up')}>{t('auth.createAccount')}</button></p>}
            {mode === 'sign-up' && <p className="muted">{t('auth.alreadyHave')} <button type="button" className="auth-link" onClick={() => switchMode('sign-in')}>{t('auth.signIn')}</button></p>}
          </div>
        </section>

        <section className="auth-preferences card stack-sm" aria-label="Accessibility preferences">
          <p className="eyebrow">{t('auth.makeEasier')}</p>
          <div className="auth-preferences__row"><span>{t('auth.voiceGuidance')}</span><button type="button" className="auth-preference" aria-pressed={settings.voiceEnabled} onClick={() => setVoiceEnabled(!settings.voiceEnabled)}>{settings.voiceEnabled ? t('auth.on') : t('auth.off')}</button></div>
          <div className="auth-preferences__row"><span>{t('auth.largeText')}</span><button type="button" className="auth-preference" aria-pressed={settings.accessibility.largeText} onClick={() => setAccessibility({ largeText: !settings.accessibility.largeText })}>{settings.accessibility.largeText ? t('auth.on') : t('auth.off')}</button></div>
        </section>
        <p className="disclaimer">{t('auth.passwordHandled')}</p>
      </main>
    </>
  );
}
