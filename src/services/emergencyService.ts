import { supabase } from '@/lib/supabase';
import type { EmergencyContactRecord, EmergencyInfo } from '@/types';
import { GUEST_EMERGENCY_INFO_KEY, isGuestPatientId } from './guestService';
import { storageService } from './storageService';

export async function loadEmergency(patientId: string) {
  if (isGuestPatientId(patientId)) {
    const contacts = await storageService.getEmergencyContacts();
    return { contacts: contacts.filter((contact) => contact.patientId === patientId).map((contact) => ({ id: contact.id, patient_id: contact.patientId, name: contact.name, phone: contact.phone, priority: contact.priority })), info: storageService.get<EmergencyInfo | null>(GUEST_EMERGENCY_INFO_KEY, null) };
  }
  if (!supabase) return { contacts: [] as EmergencyContactRecord[], info: null as EmergencyInfo | null };
  const [{ data: contacts, error: contactsError }, { data: info, error: infoError }] = await Promise.all([
    supabase.from('emergency_contacts').select('id, patient_id, name, phone, priority').eq('patient_id', patientId).order('priority'),
    supabase.from('patient_emergency_info').select('patient_id, emergency_number, emergency_notes').eq('patient_id', patientId).maybeSingle(),
  ]);
  if (contactsError) throw contactsError; if (infoError) throw infoError;
  return { contacts: (contacts ?? []) as EmergencyContactRecord[], info: info as EmergencyInfo | null };
}

export async function saveEmergencyContact(contact: Omit<EmergencyContactRecord, 'id'> & { id?: string }) {
  if (isGuestPatientId(contact.patient_id)) {
    await storageService.putEmergencyContact({ id: contact.id ?? `guest-emergency-${crypto.randomUUID()}`, patientId: contact.patient_id, name: contact.name, phone: contact.phone, priority: contact.priority });
    return;
  }
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('emergency_contacts').upsert(contact);
  if (error) throw error;
}

export async function deleteEmergencyContact(id: string) { if (id.startsWith('guest-emergency-')) { await storageService.deleteEmergencyContact(id); return; } if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.from('emergency_contacts').delete().eq('id', id); if (error) throw error; }
export async function saveEmergencyInfo(info: EmergencyInfo) { if (isGuestPatientId(info.patient_id)) { storageService.set(GUEST_EMERGENCY_INFO_KEY, info); return; } if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.from('patient_emergency_info').upsert(info); if (error) throw error; }
