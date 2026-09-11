import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AccessibilitySettings,
  AppSettings,
  ActiveProfile,
  LanguageCode,
  UserRole,
} from '@/types';
import { storageService } from '@/services/storageService';
import { configureVoice, disposeVoiceService, initializeVoiceService } from '@/services/voiceService';
import { activeProfileFrom, displayName } from '@/utils/profile';
import { currentAuthContext, onAuthStateChange, setMyLanguage, signOut } from '@/services/authService';
import { ensureCurrentUserPatient, listAuthorizedPatients } from '@/services/patientService';
import { supabase } from '@/lib/supabase';
import { inspectSupabase } from '@/lib/supabaseDiagnostics';
import { clearGuestData, startGuestMode } from '@/services/guestService';
import { errorLogger } from '@/services/errorLogger';

const KEY = 'mc:settings';

const DEFAULTS: AppSettings = {
  onboarded: false,
  role: 'patient',
  language: 'en',
  patientName: '',
  caregiverName: '',
  voiceEnabled: true,
  accessibility: {
    largeText: false,
    jumboButtons: false,
    highContrast: false,
    reducedMotion: false,
  },
  emergencyContact: '',
  shareWithCaregiver: false,
  activePatientId: undefined,
  userName: '',
  authenticated: false,
  guestMode: false,
  // Light mode is the calm, predictable default for new users. Existing
  // saved preferences still win in load(), and System/Dark remain available.
  theme: 'light',
};

interface SettingsContextValue {
  settings: AppSettings;
  setLanguage: (lang: LanguageCode) => void;
  setRole: (role: UserRole) => void;
  setVoiceEnabled: (on: boolean) => void;
  setAccessibility: (patch: Partial<AccessibilitySettings>) => void;
  update: (patch: Partial<AppSettings>) => void;
  updateActiveProfile: (patch: Partial<ActiveProfile>) => void;
  completeOnboarding: () => void;
  logout: () => Promise<void>;
  enterGuest: () => Promise<void>;
  exitGuest: (clearData: boolean) => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  authReady: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function load(): AppSettings {
  const stored = storageService.get<Partial<AppSettings>>(KEY, {});
  return {
    ...DEFAULTS,
    ...stored,
    accessibility: { ...DEFAULTS.accessibility, ...(stored.accessibility ?? {}) },
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(load);
  const [authReady, setAuthReady] = useState(!supabase);
  const authSyncId = useRef(0);

  const hydrateAuth = async (isLive: () => boolean = () => true): Promise<boolean> => {
    if (!supabase) return false;
    const syncId = ++authSyncId.current;
    setAuthReady(false);
    try {
      const context = await currentAuthContext();
      if (!isLive() || syncId !== authSyncId.current) return false;
      if (!context) {
        setSettings((s) => ({ ...s, authenticated: false }));
        return false;
      }
      let patients = await listAuthorizedPatients();
      if (context.role === 'patient' && !context.needsRoleSelection && patients.length === 0) {
        const patient = await ensureCurrentUserPatient(context.displayName);
        if (patient) patients = [patient];
      }
      if (!isLive() || syncId !== authSyncId.current) return false;
      setSettings((s) => {
        const active = patients.find((patient) => patient.id === s.activePatientId) ?? patients[0];
        return { ...s, authenticated: true, guestMode: false, onboarded: true, needsRoleSelection: context.needsRoleSelection, role: context.role, language: context.language || s.language, userName: context.displayName, caregiverName: context.role === 'caregiver' ? context.displayName : s.caregiverName, activePatientId: active?.id ?? s.activePatientId, patientName: active?.name ?? s.patientName, shareWithCaregiver: context.role === 'patient' ? (active?.share_with_caregiver ?? s.shareWithCaregiver) : s.shareWithCaregiver, activeProfile: active ? { id: active.id, patientName: active.name, caregiverName: context.role === 'caregiver' ? context.displayName : s.caregiverName, role: context.role } : s.activeProfile };
      });
      return true;
    } catch (error) {
      void errorLogger.captureRequestError(error, { feature: 'auth', eventType: 'AUTH_CONTEXT_HYDRATION_FAILED', action: 'hydrate_auth' });
      if (isLive() && syncId === authSyncId.current) setSettings((s) => ({ ...s, authenticated: false }));
      return false;
    } finally {
      if (isLive() && syncId === authSyncId.current) setAuthReady(true);
    }
  };

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void inspectSupabase().catch(() => undefined);
    void hydrateAuth(() => live);
    const unsubscribe = onAuthStateChange(() => { void hydrateAuth(() => live); });
    return () => { live = false; unsubscribe(); };
  }, []);

  // Persist on every change.
  useEffect(() => {
    storageService.set(KEY, settings);
  }, [settings]);

  // Apply accessibility + language to the document root.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.largeText = String(settings.accessibility.largeText);
    el.dataset.jumbo = String(settings.accessibility.jumboButtons);
    el.dataset.contrast = String(settings.accessibility.highContrast);
    el.dataset.reducedMotion = String(settings.accessibility.reducedMotion);
    el.lang = settings.language;
    el.dataset.theme = settings.theme ?? 'system';
  }, [settings.accessibility, settings.language, settings.theme]);

  // Keep the voice service in sync.
  useEffect(() => {
    configureVoice(settings.language, settings.voiceEnabled);
  }, [settings.language, settings.voiceEnabled]);

  useEffect(() => {
    initializeVoiceService();
    return disposeVoiceService;
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      setLanguage: (language) => {
        setSettings((s) => ({ ...s, language }));
        // Local state updates immediately; the authenticated profile keeps the
        // preference when this user returns on another device.
        void setMyLanguage(language).catch(() => undefined);
      },
      setRole: (role) => setSettings((s) => ({ ...s, role })),
      setVoiceEnabled: (voiceEnabled) =>
        setSettings((s) => ({ ...s, voiceEnabled })),
      setAccessibility: (patch) =>
        setSettings((s) => ({
          ...s,
          accessibility: { ...s.accessibility, ...patch },
        })),
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      updateActiveProfile: (patch) => setSettings((s) => {
        const active = activeProfileFrom(s);
        const next = { ...active, ...patch };
        return {
          ...s,
          activeProfile: next,
          role: next.role,
          activePatientId: next.id,
          patientName: next.patientName,
          caregiverName: next.caregiverName,
          userName: displayName(next),
        };
      }),
      completeOnboarding: () => setSettings((s) => ({ ...s, onboarded: true, authenticated: true })),
      logout: async () => {
        await signOut();
        setSettings((s) => ({ ...s, authenticated: false, guestMode: false }));
      },
      enterGuest: async () => {
        await startGuestMode();
        setSettings((s) => ({ ...s, authenticated: false, guestMode: true, onboarded: true, role: 'patient', needsRoleSelection: false, userName: 'Guest', patientName: 'Alex Morgan (Demo)', activePatientId: 'guest-demo-patient', activeProfile: { id: 'guest-demo-patient', patientName: 'Alex Morgan (Demo)', caregiverName: '', role: 'patient' } }));
      },
      exitGuest: async (clearData) => {
        if (clearData) await clearGuestData();
        setSettings((s) => ({ ...s, authenticated: false, guestMode: false, onboarded: false, activePatientId: undefined, activeProfile: undefined, patientName: '', caregiverName: '', userName: '', needsRoleSelection: false }));
      },
      refreshAuth: () => hydrateAuth(),
      authReady,
    }),
    [settings, authReady],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
