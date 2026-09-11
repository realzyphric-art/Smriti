import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useSettings } from '@/hooks/useSettings';
import { loadEmergency } from '@/services/emergencyService';
import type { EmergencyContactRecord, EmergencyInfo } from '@/types';

function HoldCall({ label, number, primary = false }: { label: string; number?: string | null; primary?: boolean }) {
  const { t } = useI18n();
  const [holding, setHolding] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!holding) return;
    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, [holding]);
  const call = () => { if (ready && number) window.location.href = `tel:${number.replace(/[^+\d]/g, '')}`; };
  const text = !number ? `${label} ${t('emergency.unavailable')}` : !holding ? label : ready ? t('emergency.releaseTo', { label }) : t('emergency.keepHolding', { label });
  return <Button size="lg" block variant={primary ? 'danger' : 'secondary'} disabled={!number} onPointerDown={() => { setReady(false); setHolding(true); }} onPointerUp={() => { call(); setHolding(false); }} onPointerLeave={() => setHolding(false)}>{text}</Button>;
}

export function Emergency() {
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<EmergencyContactRecord[]>([]);
  const [info, setInfo] = useState<EmergencyInfo | null>(null);
  useEffect(() => { if (settings.activePatientId) loadEmergency(settings.activePatientId).then((data) => { setContacts(data.contacts); setInfo(data.info); }).catch(() => undefined); }, [settings.activePatientId]);
  return <><AppHeader subtitle={t('emergency.title')} showBack onBack={() => navigate('/home')} /><main className="page emergency-page"><section className="emergency-hero"><div className="emergency-hero__icon"><Icon name="phone" size={30} /></div><div><span className="eyebrow">{t('emergency.title')}</span><h1>{t('emergency.needHelp')}</h1><p>{t('emergency.holdInstruction')}</p></div></section><section className="emergency-primary"><HoldCall primary label={t('emergency.callCaregiver')} number={contacts[0]?.phone} /></section><section className="emergency-secondary"><h2>Other ways to reach help</h2><HoldCall label={t('emergency.callSecondary')} number={contacts[1]?.phone} /><HoldCall label={t('emergency.callService')} number={info?.emergency_number} /></section>{info?.emergency_notes && <div className="emergency-note"><strong>{t('emergency.importantInfo')}</strong><p className="muted">{info.emergency_notes}</p></div>}<p className="disclaimer">{t('emergency.disclaimer')}</p></main></>;
}
