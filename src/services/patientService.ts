import { supabase } from '@/lib/supabase';
import type { PatientRecord } from '@/types';

export type NewPatient = Pick<PatientRecord, 'name'> & Pick<PatientRecord, 'date_of_birth' | 'notes' | 'interests' | 'share_with_caregiver'>;

export async function createPatient(patient: NewPatient) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Please sign in before adding a patient.');
  const name = patient.name.trim();
  if (!name) throw new Error('Patient name is required.');
  const { data, error } = await supabase.from('patients').insert({
    name,
    date_of_birth: patient.date_of_birth ?? null,
    notes: patient.notes ?? null,
    interests: patient.interests ?? null,
    share_with_caregiver: patient.share_with_caregiver ?? false,
    auth_user_id: authData.user.id,
  }).select().single();
  if (error) throw error;
  return data as PatientRecord;
}

export async function updatePatient(patientId: string, changes: Pick<PatientRecord, 'name' | 'date_of_birth' | 'notes' | 'interests' | 'profile_photo_path'>) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('patients').update({
    name: changes.name.trim(),
    date_of_birth: changes.date_of_birth ?? null,
    notes: changes.notes ?? null,
    interests: changes.interests ?? null,
    profile_photo_path: changes.profile_photo_path ?? null,
  }).eq('id', patientId).select().single();
  if (error) throw error;
  return data as PatientRecord;
}

const mediaBucket = 'patient-media';

async function optimisePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= 900_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
}

export async function uploadPatientPhoto(patientId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const uploadFile = await optimisePhoto(file);
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${patientId}/profile/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(mediaBucket).upload(path, uploadFile, { upsert: false, contentType: uploadFile.type });
  if (error) throw error;
  return path;
}

export async function patientPhotoUrl(path: string | null): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage.from(mediaBucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** Creates the signed-in patient's row only when the RLS-protected row is missing. */
export async function ensureCurrentUserPatient(name: string): Promise<PatientRecord | null> {
  if (!supabase) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user) return null;
  const { data: existing, error: lookupError } = await supabase
    .from('patients')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing as PatientRecord;
  const { data, error } = await supabase
    .from('patients')
    .insert({ auth_user_id: user.id, name: name.trim() || 'My profile', share_with_caregiver: false })
    .select()
    .single();
  if (error) throw error;
  return data as PatientRecord;
}

export async function listAuthorizedPatients() {
  if (!supabase) return [] as PatientRecord[];
  // Never include the private patient-to-caregiver connection code in the
  // caregiver's normal patient list response.
  const { data, error } = await supabase.from('patients').select('id, auth_user_id, name, profile_photo_path, date_of_birth, notes, interests, share_with_caregiver, updated_at').order('name');
  if (error) throw error;
  return (data ?? []) as PatientRecord[];
}

export async function setPatientAccess(patientId: string, status: 'pending' | 'active' | 'revoked') {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Please sign in before changing patient access.');
  const { error } = await supabase.from('caregiver_patient').upsert({ caregiver_id: authData.user.id, patient_id: patientId, status, granted_by: authData.user.id });
  if (error) throw error;
}
