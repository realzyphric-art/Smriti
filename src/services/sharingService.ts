import { supabase } from '@/lib/supabase';
import type { CaregiverLink } from '@/types';

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
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
  const { error } = await requireClient().rpc('request_caregiver_access', {
    patient_identifier: identifier.trim().toLowerCase(),
  });
  if (error) throw error;
}

export async function requestCaregiverAccessByCode(code: string): Promise<void> {
  const { error } = await requireClient().rpc('request_caregiver_access_by_code', {
    connection_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
}

export async function getPatientShareCode(): Promise<string> {
  const { data, error } = await requireClient().rpc('get_patient_share_code');
  if (error) throw error;
  return String(data ?? '');
}

export async function listPatientCaregiverLinks(): Promise<CaregiverLink[]> {
  const { data, error } = await requireClient().rpc('list_patient_caregiver_links');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapLink);
}

export async function listMyCaregiverLinks(): Promise<CaregiverLink[]> {
  const { data, error } = await requireClient().rpc('list_my_caregiver_links');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapLink);
}

export async function approveCaregiverInvite(link: Pick<CaregiverLink, 'caregiver_id' | 'patient_id'>): Promise<void> {
  const { error } = await requireClient().rpc('approve_caregiver_invite', {
    p_caregiver_id: link.caregiver_id,
    p_patient_id: link.patient_id,
  });
  if (error) throw error;
}

export async function revokeCaregiverAccess(link: Pick<CaregiverLink, 'caregiver_id' | 'patient_id'>): Promise<void> {
  const { error } = await requireClient().rpc('revoke_caregiver_access', {
    p_caregiver_id: link.caregiver_id,
    p_patient_id: link.patient_id,
  });
  if (error) throw error;
}

export async function setPatientSharing(patientId: string, enabled: boolean): Promise<void> {
  const { error } = await requireClient().rpc('set_patient_sharing', {
    p_patient_id: patientId,
    enabled,
  });
  if (error) throw error;
}

export async function touchPatientSync(patientId: string): Promise<void> {
  if (!supabase || !patientId) return;
  const { error } = await supabase.rpc('touch_patient_sync', { p_patient_id: patientId });
  if (error) throw error;
}

export async function patientLastSyncedAt(patientId: string): Promise<string | null> {
  if (!supabase || !patientId) return null;
  const { data, error } = await supabase
    .from('patient_sync_status')
    .select('last_synced_at')
    .eq('patient_id', patientId)
    .maybeSingle();
  if (error) throw error;
  return (data?.last_synced_at as string | null | undefined) ?? null;
}
