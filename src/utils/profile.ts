import type { ActiveProfile, AppSettings, UserRole } from '@/types';

export const FALLBACK_NAME = 'User';

/** Normalises legacy settings into the single active-profile shape. */
export function activeProfileFrom(settings: AppSettings): ActiveProfile {
  if (settings.activeProfile) return settings.activeProfile;
  const role: UserRole = settings.role;
  return {
    id: settings.activePatientId ?? 'local-profile',
    patientName: settings.patientName.trim(),
    caregiverName: settings.caregiverName.trim(),
    role,
  };
}

export function displayName(profile: ActiveProfile): string {
  return (profile.role === 'caregiver' ? profile.caregiverName : profile.patientName).trim() ||
    profile.patientName.trim() || profile.caregiverName.trim() || FALLBACK_NAME;
}

export function avatarInitial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase() || FALLBACK_NAME.charAt(0);
}
