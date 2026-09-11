import type { PatientProfile } from '@/types';
import { storageService } from './storageService';

const pinKey = 'mc:pin-v2';
const credentialKey = 'mc:passkey';
const makeId = () => `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
export interface PasskeyMetadata { credentialId: string; createdAt: number; }
export type BiometricStatus = 'supported' | 'unavailable';

const bytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const base64url = (value: ArrayBuffer | Uint8Array) => {
  let binary = '';
  new Uint8Array(value).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const fromBase64url = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

export async function profiles(): Promise<PatientProfile[]> {
  return storageService.getProfiles();
}
export async function createProfile(name: string, details: Pick<PatientProfile, 'dateOfBirth' | 'notes' | 'interests'> & Partial<Pick<PatientProfile, 'profilePhotoUrl'>> = {}): Promise<PatientProfile> {
  const profile: PatientProfile = {
    id: makeId(),
    name: name.trim(),
    createdAt: Date.now(),
    shareWithCaregiver: false,
    profilePhotoUrl: details.profilePhotoUrl ?? null,
    dateOfBirth: details.dateOfBirth ?? null,
    notes: details.notes?.trim() ?? '',
    interests: details.interests?.trim() ?? '',
  };
  await storageService.putProfile(profile);
  return profile;
}
export async function updateProfile(profile: PatientProfile): Promise<void> { await storageService.putProfile(profile); }
export async function removeProfile(id: string): Promise<void> { await storageService.deletePatientData(id); }

// This is a demo-only local PIN hash. Production sign-in must be verified by a backend.
async function hashPin(pin: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return base64url(digest);
}
export async function savePin(pin: string): Promise<void> {
  const salt = base64url(bytes(16));
  storageService.set(pinKey, { salt, hash: await hashPin(pin, salt) });
}
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = storageService.get<{ salt: string; hash: string } | null>(pinKey, null);
  return Boolean(stored && stored.hash === await hashPin(pin, stored.salt));
}

export function biometricStatus(): BiometricStatus {
  return typeof window !== 'undefined' && window.isSecureContext && typeof PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials?.create && !!navigator.credentials?.get ? 'supported' : 'unavailable';
}
export const biometricAvailable = () => biometricStatus() === 'supported';
export async function canUsePlatformBiometrics(): Promise<boolean> {
  return biometricAvailable() && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}
export async function registerPasskey(userId: string, userName: string): Promise<PasskeyMetadata> {
  if (!await canUsePlatformBiometrics()) throw new Error('A platform passkey authenticator is unavailable.');
  const credential = await navigator.credentials.create({ publicKey: {
    challenge: bytes(32), rp: { name: 'Smriti' },
    user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60_000,
  } });
  if (!credential || !(credential instanceof PublicKeyCredential)) throw new Error('Passkey registration was cancelled.');
  const metadata = { credentialId: base64url(credential.rawId), createdAt: Date.now() };
  storageService.set(credentialKey, metadata);
  return metadata;
}
export async function verifyPasskey(): Promise<boolean> {
  const metadata = storageService.get<PasskeyMetadata | null>(credentialKey, null);
  if (!metadata) throw new Error('No passkey is set up on this browser.');
  if (!await canUsePlatformBiometrics()) throw new Error('A platform passkey authenticator is unavailable.');
  const assertion = await navigator.credentials.get({ publicKey: {
    challenge: bytes(32), allowCredentials: [{ type: 'public-key', id: fromBase64url(metadata.credentialId) }], userVerification: 'required', timeout: 60_000,
  } });
  return Boolean(assertion);
}
