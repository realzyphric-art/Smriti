import { useEffect, useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
}

function isAppleMobile(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function InstallAppCard() {
  const [installed, setInstalled] = useState(() => isStandalone());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const apple = isAppleMobile();
  const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!installPrompt && !apple && !mobile) return null;

  return (
    <Card variant="tint" padLg className="install-app-card">
      <div className="row-between" style={{ gap: '0.75rem', alignItems: 'flex-start' }}>
        <div>
          <h2 className="card-title">Install Smriti</h2>
          <p className="muted" style={{ marginTop: '0.3rem' }}>
            Keep Smriti on your phone for quick access and a calm, app-like screen.
          </p>
        </div>
        <span aria-hidden="true" style={{ fontSize: '1.8rem', lineHeight: 1 }}>📲</span>
      </div>
      {apple ? (
        <p className="muted install-app-card__hint">In Safari, tap Share, then choose <strong>Add to Home Screen</strong>.</p>
      ) : installPrompt ? (
        <Button variant="primary" block onClick={() => void install()} icon="download">Install Smriti</Button>
      ) : (
        <p className="muted install-app-card__hint">Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
      )}
    </Card>
  );
}
