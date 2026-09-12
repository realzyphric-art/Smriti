import { supabase } from '@/lib/supabase';
import type { CaregiverLink } from '@/types';

const SHARING_REQUEST_TIMEOUT_MS = 12_000;

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

async function withSharingTimeout<T>(operation: PromiseLike<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), SHARING_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mapLink(row: Record<string, unknown>): CaregiverLink {
  return {
    id: `${String(row.caregiver_id)}:${String(row.patient_id)}`,
    caregiver_id: String(row.caregiver_id),
    patient_id: String(row.patient_id),
    caregiver_name: String(row.caregiver_name ?? 'Caregiver'),
    patient_name: String(row.patient_name ?? 'Patient'),
    status: (row.status as CaregiverLink['status']) ?? 'pending',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function requestCaregiverAccess(identifier: string): Promise<void> {
  const { error } = await withSharingTimeout(requireClient().rpc('request_caregiver_access', {
    patient_identifier: identifier.trim().toLowerCase(),
  }), 'The invitation request took too long. Check the connection and try again.');
  if (error) throw error;
}

export async function requestCaregiverAccessByCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(normalized)) throw new Error('Enter the 8-character patient connection code.');
  const { data, error } = await withSharingTimeout(requireClient().rpc('request_caregiver_access_by_code', {
    connection_code: normalized,
  }), 'The invitation request took too long. Check the connection and try again.');
  if (error) throw error;
  if (data !== true) throw new Error('No patient was found with that connection code.');
}

export async function getPatientShareCode(patientId?: string): Promise<string> {
  const client = requireClient();
  const { data, error } = patientId
    ? await withSharingTimeout(client.rpc('get_patient_share_code_for_patient', { p_patient_id: patientId }), 'Your connection code took too long to load.')
    : await withSharingTimeout(client.rpc('get_patient_share_code'), 'Your connection code took too long to load.');
  if (error) throw error;
  const code = String(data ?? '').trim().toUpperCase();
  if (!code) throw new Error('A patient connection code is not available yet.');
  return code;
}

export async function listPatientCaregiverLinks(): Promise<CaregiverLink[]> {
  const { data, error } = await withSharingTimeout(requireClient().rpc('list_patient_caregiver_links'), 'Sharing requests took too long to load.');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapLink);
}

export async function listMyCaregiverLinks(): Promise<CaregiverLink[]> {
  const { data, error } = await withSharingTimeout(requireClient().rpc('list_my_caregiver_links'), 'Your invitations took too long to load.');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapLink);
}

export async function approveCaregiverInvite(link: Pick<CaregiverLink, 'caregiver_id' | 'patient_id'>): Promise<void> {
  const { error } = await withSharingTimeout(requireClient().rpc('approve_caregiver_invite', {
    p_caregiver_id: link.caregiver_id,
    p_patient_id: link.patient_id,
  }), 'Approval took too long. Check the connection and try again.');
  if (error) throw error;
}

export async function revokeCaregiverAccess(link: Pick<CaregiverLink, 'caregiver_id' | 'patient_id'>): Promise<void> {
  const { error } = await withSharingTimeout(requireClient().rpc('revoke_caregiver_access', {
    p_caregiver_id: link.caregiver_id,
    p_patient_id: link.patient_id,
  }), 'Changing access took too long. Check the connection and try again.');
  if (error) throw error;
}

export async function setPatientSharing(patientId: string, enabled: boolean): Promise<void> {
  const { error } = await withSharingTimeout(requireClient().rpc('set_patient_sharing', {
    p_patient_id: patientId,
    enabled,
  }), 'Sharing could not be updated because the connection timed out.');
  if (error) throw error;
}

export async function touchPatientSync(patientId: string): Promise<void> {
  if (!supabase || !patientId) return;
  const { error } = await withSharingTimeout(supabase.rpc('touch_patient_sync', { p_patient_id: patientId }), 'Sync status update timed out.');
  if (error) throw error;
}

export async function patientLastSyncedAt(patientId: string): Promise<string | null> {
  if (!supabase || !patientId) return null;
  const { data, error } = await withSharingTimeout(
    supabase.from('patient_sync_status').select('last_synced_at').eq('patient_id', patientId).maybeSingle(),
    'Sync status took too long to load.',
  );
  if (error) throw error;
  return (data?.last_synced_at as string | null | undefined) ?? null;
}
