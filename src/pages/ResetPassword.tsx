import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { PasswordField } from '@/components/PasswordField';
import { authErrorMessage, isStrongEnoughPassword, PASSWORD_REQUIREMENTS, signOut, updatePassword } from '@/services/authService';

export function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!isStrongEnoughPassword(password)) { setError(PASSWORD_REQUIREMENTS); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await updatePassword(password);
      await signOut();
      navigate('/', { replace: true, state: { resetComplete: true } });
    } catch (reason) {
      setError(authErrorMessage(reason, 'Unable to update your password. Ask for a new reset link and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return <><AppHeader /><main className="page page--flow auth-page"><section className="card auth-card stack-lg"><div className="stack-sm text-center"><div className="auth-hero__icon" aria-hidden="true">🔐</div><h1>Choose a new password</h1><p className="page-sub">Create a password you can remember safely.</p></div><form className="stack" onSubmit={(event) => void submit(event)}><PasswordField id="reset-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus /><PasswordField id="reset-confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" /><p className="muted">{PASSWORD_REQUIREMENTS}</p><Button type="submit" size="lg" block disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</Button></form>{error && <p className="banner banner--red" role="alert">{error}</p>}</section></main></>;
}
