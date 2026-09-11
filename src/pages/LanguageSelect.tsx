import { useNavigate } from 'react-router-dom';
import { LANGUAGES, useI18n } from '@/i18n';
import { useSettings } from '@/hooks/useSettings';
import { useVoice } from '@/hooks/useVoice';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';

export function LanguageSelect() {
  const { t } = useI18n();
  const { settings, setLanguage, completeOnboarding } = useSettings();
  const { say, supported, enabled } = useVoice();
  const navigate = useNavigate();

  const hearScreen = () => {
    if (supported && enabled) say(`${t('language.title')}. ${t('language.subtitle')}`);
  };

  const onContinue = () => {
    completeOnboarding();
    navigate('/home');
  };

  return (
    <>
      <AppHeader subtitle={t('language.setup')} />
      <main className="page page--flow">
        <div className="stack-sm">
          <h1>{t('language.title')}</h1>
          <p className="text-muted" style={{ fontSize: 'var(--fs-body-lg)' }}>
            {t('language.subtitle')}
          </p>
        </div>

        {/* Hear this screen */}
        <button
          type="button"
          className="banner banner--amber"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none' }}
          onClick={hearScreen}
        >
          <span className="medallion medallion--amber" aria-hidden="true">
            <Icon name="volume" size={26} />
          </span>
          <div className="grow">
            <strong>{t('language.hearTitle')}</strong>
            <div style={{ fontSize: 'var(--fs-caption)' }}>{t('language.hearSub')}</div>
          </div>
          <span className="chip chip--soft">{t('language.audioOn')}</span>
        </button>

        <div className="eyebrow">{t('language.selectOne')}</div>

        <div className="stack-sm" role="radiogroup" aria-label={t('language.title')}>
          {LANGUAGES.map((lang) => {
            const active = settings.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="radio"
                aria-checked={active}
                className="setting-row"
                style={
                  active
                    ? {
                        borderColor: 'var(--secondary)',
                        borderWidth: 2,
                        background: 'var(--secondary-container)',
                      }
                    : undefined
                }
                onClick={() => setLanguage(lang.code)}
              >
                <span
                  className="medallion medallion--soft"
                  aria-hidden="true"
                  style={{ fontSize: '1.2rem', fontFamily: 'var(--font-head)', fontWeight: 800 }}
                >
                  {lang.sample.slice(0, 2)}
                </span>
                <span className="setting-row__body">
                  <span className="setting-row__title" style={{ fontSize: 'var(--fs-body-lg)' }}>
                    {lang.native}
                  </span>
                  <span className="setting-row__desc">{lang.english}</span>
                </span>
                {active ? (
                  <span className="chip chip--green">
                    <Icon name="check" size={16} strokeWidth={3} /> {t('language.selected')}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '1.6rem',
                      height: '1.6rem',
                      borderRadius: '9999px',
                      border: '2.5px solid var(--border-strong)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="banner banner--soft">
          <span className="medallion medallion--green" aria-hidden="true">
            <Icon name="users" size={24} />
          </span>
          <div>
            <strong>{t('language.familyTitle')}</strong>
            <div style={{ fontSize: 'var(--fs-caption)' }}>{t('language.familyBody')}</div>
          </div>
        </div>

        <Button variant="primary" size="lg" block iconRight="arrow-right" onClick={onContinue}>
          {t('common.continue')}
        </Button>
        <p className="text-center text-muted" style={{ fontSize: 'var(--fs-caption)' }}>
          <Icon name="lock" size={16} /> {t('language.noPasswords')}
        </p>
      </main>
    </>
  );
}
