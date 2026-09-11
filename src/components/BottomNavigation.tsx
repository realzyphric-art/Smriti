import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from './Icon';
import { AI_CHAT_ENABLED } from '@/config/features';

interface NavDef {
  to: string;
  labelKey: string;
  icon: IconName;
  end?: boolean;
}

const PATIENT_NAV: NavDef[] = [
  { to: '/home', labelKey: 'nav.home', icon: 'home' },
  { to: '/games', labelKey: 'nav.activities', icon: 'games' },
  { to: '/people', labelKey: 'nav.people', icon: 'users' },
  { to: '/reminders', labelKey: 'nav.reminders', icon: 'bell' },
  { to: '/chat', labelKey: 'nav.chat', icon: 'sparkle' },
  { to: '/settings', labelKey: 'nav.more', icon: 'settings' },
];

const CAREGIVER_NAV: NavDef[] = [
  { to: '/caregiver', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/caregiver/patient', labelKey: 'nav.patients', icon: 'users' },
  { to: '/caregiver/progress', labelKey: 'nav.activity', icon: 'chart' },
  { to: '/caregiver/alerts', labelKey: 'nav.alerts', icon: 'bell' },
  { to: '/caregiver/settings', labelKey: 'nav.more', icon: 'settings' },
];

export function BottomNavigation({ role }: { role: 'patient' | 'caregiver' }) {
  const { t } = useI18n();
  const items = (role === 'patient' ? PATIENT_NAV : CAREGIVER_NAV).filter(
    (item) => AI_CHAT_ENABLED || item.to !== '/chat',
  );

  return (
    <nav className="bottom-nav" aria-label="Primary">
      <div className="bottom-nav__inner">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="nav-item"
          >
            <span className="nav-item__icon">
              <Icon name={item.icon} size={26} />
            </span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
