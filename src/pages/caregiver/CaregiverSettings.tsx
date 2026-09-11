import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, LANGUAGES } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/hooks/useToast';
import { AppHeader } from '@/components/AppHeader';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import type { LanguageCode } from '@/types';

export function CaregiverSettings() {
  const { t } = useI18n();
  const { settings, setLanguage, setRole } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [langOpen, setLangOpen] = useState(false);

  const currentLang =
    LANGUAGES.find((l) => l.code === settings.language) ?? LANGUAGES[0];

  const readScreen = `${t('nav.settings')}. ${t('caregiver.subtitle')}.`;

  const chooseLanguage = (code: LanguageCode) => {
    setLanguage(code);
    setLangOpen(false);
    showToast(t('settings.changeLanguage'), '🌐');
  };

  const backToPatient = () => {
    setRole('patient');
    navigate('/home');
  };

  return (
    <>
      <AppHeader subtitle={t('nav.settings')} readText={readScreen} />
      <main className="page">
        <div className="stack-lg">
          <div>
            <h1 className="page-title">{t('settings.title')}</h1>
            <p className="page-sub">{t('caregiver.subtitle')}</p>
          </div>

          {/* Sharing / privacy */}
          <Card variant="tint" padLg>
            <div className="row" style={{ gap: '0.6rem', marginBottom: '0.5rem' }}>
              <Icon name="shield" size={22} />
              <div>
                <h2 className="card-title">{t('settings.privacyTitle')}</h2>
                <p className="muted">{t('settings.privacyBody')}</p>
              </div>
            </div>
            <p className="muted">Patients control sharing. You can request access from the patient page, and the patient must approve before their information becomes visible.</p>
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

          {/* Caregiver sync status */}
          <Card>
            <div className="row-between">
              <div className="row" style={{ gap: '0.6rem' }}>
                <Icon name="heart" size={22} />
                <strong>{t('settings.caregiverSync')}</strong>
              </div>
              <span className="pill pill--green">{t('settings.linked')}</span>
            </div>
          </Card>

          {/* Back to patient view */}
          <Button variant="secondary" icon="arrow-left" block size="lg" onClick={backToPatient}>
            {t('caregiver.switchToPatient')}
          </Button>

          <p className="disclaimer">{t('common.disclaimer')}</p>
        </div>
      </main>

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
    </>
  );
}
