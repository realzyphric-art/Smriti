import { supabase } from '@/lib/supabase';
import type { PersonMemory } from '@/types';
import { isGuestPatientId } from './guestService';
import { storageService } from './storageService';
import { touchPatientSync } from './sharingService';

const bucket = 'patient-media';
export const MAX_FAMILY_MEMBERS = 5;
export const MAX_PERSON_PHOTOS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export function personPhotoPaths(person: Partial<PersonMemory>): string[] {
  const paths = Array.isArray(person.photo_paths)
    ? person.photo_paths.filter((path): path is string => typeof path === 'string' && path.length > 0)
    : [];
  if (paths.length > 0) return paths.slice(0, MAX_PERSON_PHOTOS);
  return person.photo_path ? [person.photo_path] : [];
}

function normalizePerson(person: PersonMemory): PersonMemory {
  const photo_paths = personPhotoPaths(person);
  return { ...person, photo_path: photo_paths[0] ?? null, photo_paths };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function saveOfflinePerson(person: Partial<PersonMemory> & Pick<PersonMemory, 'patient_id' | 'name'>, selectedPhotos: File[], previousPhotoPaths: string[]) {
  const photo_paths = selectedPhotos.length > 0 ? await Promise.all(selectedPhotos.map(fileToDataUrl)) : previousPhotoPaths;
  const localPerson: PersonMemory = {
    id: person.id ?? `offline-person-${crypto.randomUUID()}`,
    patient_id: person.patient_id,
    name: person.name.trim(), relationship: person.relationship ?? 'other', nickname: person.nickname ?? null,
    photo_path: photo_paths[0] ?? null, photo_paths, notes: person.notes ?? null,
    voice_recording_path: null, syncPending: true,
  };
  await storageService.putPersonMemory(localPerson);
  await storageService.putSyncOperation({ id: `person-upsert:${localPerson.id}`, kind: 'person-upsert', patientId: localPerson.patient_id, payload: localPerson, createdAt: Date.now() });
  return localPerson;
}

export async function listPeople(patientId: string, useGuestStorage = false): Promise<PersonMemory[]> {
  if (useGuestStorage || isGuestPatientId(patientId)) {
    const people = await storageService.getPersonMemories();
    return people.filter((person) => person.patient_id === patientId).sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!supabase) return [];
  try {
    let result = await supabase.from('person_memories').select('id, patient_id, name, relationship, nickname, photo_path, photo_paths, notes, voice_recording_path').eq('patient_id', patientId).order('created_at').limit(50);
    // Keep older deployments readable until the photo_paths migration is applied.
    if (result.error && /photo_paths|column/i.test(result.error.message)) {
      result = await supabase.from('person_memories').select('id, patient_id, name, relationship, nickname, photo_path, notes, voice_recording_path').eq('patient_id', patientId).order('created_at').limit(50) as typeof result;
    }
    if (result.error) throw result.error;
    const people = (result.data ?? []).map((person) => normalizePerson(person as PersonMemory));
    await Promise.all(people.map((person) => storageService.putPersonMemory({ ...person, syncPending: false })));
    return people;
  } catch {
    const cached = await storageService.getPersonMemories();
    return cached.filter((person) => person.patient_id === patientId).sort((a, b) => a.name.localeCompare(b.name));
  }
}

export async function savePerson(person: Partial<PersonMemory> & Pick<PersonMemory, 'patient_id' | 'name'>, photos: File[] = [], voice?: File | null, useGuestStorage = false) {
  const selectedPhotos = photos.slice(0, MAX_PERSON_PHOTOS);
  for (const photo of selectedPhotos) {
    if (!photo.type.startsWith('image/')) throw new Error('Please choose image files only.');
    if (photo.size > MAX_PHOTO_BYTES) throw new Error('Each photo must be 8 MB or smaller.');
  }
  const previousPhotoPaths = personPhotoPaths(person);
  if (useGuestStorage || isGuestPatientId(person.patient_id)) {
    const photo_paths = selectedPhotos.length > 0 ? await Promise.all(selectedPhotos.map(fileToDataUrl)) : previousPhotoPaths;
    const localPerson: PersonMemory = {
      id: person.id ?? `guest-person-${crypto.randomUUID()}`,
      patient_id: person.patient_id,
      name: person.name.trim(),
      relationship: person.relationship ?? 'other',
      nickname: person.nickname ?? null,
      photo_path: photo_paths[0] ?? null,
      photo_paths,
      notes: person.notes ?? null,
      voice_recording_path: null,
    };
    await storageService.putPersonMemory(localPerson);
    return localPerson;
  }
  if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) return saveOfflinePerson(person, selectedPhotos, previousPhotoPaths);
  const client = supabase;
  try {
  const id = person.id ?? crypto.randomUUID();
  const optimisePhoto = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size <= 900_000) return file;
    const bitmap = await createImageBitmap(file); const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  };
  const upload = async (file: File, kind: 'people' | 'voice', index = 0) => {
    const uploadFile = kind === 'people' ? await optimisePhoto(file) : file;
    const path = `${person.patient_id}/${kind}/${id}-${index}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await client.storage.from(bucket).upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
    if (error) throw error;
    return path;
  };
  const photo_paths = selectedPhotos.length > 0
    ? await Promise.all(selectedPhotos.map((photo, index) => upload(photo, 'people', index)))
    : previousPhotoPaths;
  const payload = { ...person, id, photo_path: photo_paths[0] ?? null, photo_paths, voice_recording_path: voice ? await upload(voice, 'voice') : person.voice_recording_path ?? null };
  let result = await client.from('person_memories').upsert(payload).select().single();
  // Keep the app usable on the old one-photo schema while the migration is pending.
  if (result.error && /photo_paths|column/i.test(result.error.message)) {
    const legacyPayload = { ...payload };
    delete (legacyPayload as { photo_paths?: string[] }).photo_paths;
    result = await client.from('person_memories').upsert(legacyPayload).select().single();
  }
  if (result.error) throw result.error;
  if (selectedPhotos.length > 0 && previousPhotoPaths.length > 0) {
    await client.storage.from(bucket).remove(previousPhotoPaths).catch(() => undefined);
  }
  const saved = normalizePerson(result.data as PersonMemory);
  await storageService.putPersonMemory({ ...saved, syncPending: false });
  await touchPatientSync(person.patient_id).catch(() => undefined);
  return saved;
  } catch {
    return saveOfflinePerson(person, selectedPhotos, previousPhotoPaths);
  }
}

export async function removePerson(id: string, useGuestStorage = false) {
  if (useGuestStorage || id.startsWith('guest-person-')) {
    await storageService.deletePersonMemory(id);
    return;
  }
  if (!supabase) throw new Error('Supabase is not configured.');
  const cached = (await storageService.getPersonMemories()).find((person) => person.id === id);
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try { const { error } = await supabase.from('person_memories').delete().eq('id', id); if (error) throw error; await storageService.deletePersonMemory(id); if (cached) await touchPatientSync(cached.patient_id).catch(() => undefined); return; } catch { /* fall through to the offline queue */ }
  }
  if (cached) await storageService.putSyncOperation({ id: `person-delete:${id}`, kind: 'person-delete', patientId: cached.patient_id, payload: { id }, createdAt: Date.now() });
  await storageService.deletePersonMemory(id);
}

export async function personPhotoUrl(path: string | null, useGuestStorage = false) {
  if (!path) return null;
  if (useGuestStorage) return path;
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
