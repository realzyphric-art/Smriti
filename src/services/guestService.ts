import type { EmergencyContact, PatientProfile, PersonMemory, Reminder } from '@/types';
import { storageService } from './storageService';

export const GUEST_PATIENT_ID = 'guest-demo-patient';
export const GUEST_EMERGENCY_INFO_KEY = `mc:guest-emergency-info:${GUEST_PATIENT_ID}`;

export function isGuestPatientId(patientId?: string | null): boolean {
  return patientId === GUEST_PATIENT_ID;
}

const guestProfile: PatientProfile = {
  id: GUEST_PATIENT_ID,
  name: 'Alex Morgan (Demo)',
  createdAt: Date.now(),
  shareWithCaregiver: false,
};

const guestPeople: PersonMemory[] = [
  { id: 'guest-person-maya', patient_id: GUEST_PATIENT_ID, name: 'Maya Morgan', relationship: 'family', nickname: 'Maya', notes: 'Alex’s daughter. Loves gardening.' },
  { id: 'guest-person-raj', patient_id: GUEST_PATIENT_ID, name: 'Raj Morgan', relationship: 'family', nickname: 'Raj', notes: 'Alex’s son. Calls on Sundays.' },
  { id: 'guest-person-nurse', patient_id: GUEST_PATIENT_ID, name: 'Nurse Anita', relationship: 'caregiver', notes: 'Helpful care team member.' },
];

const guestReminders: Reminder[] = [
  { id: 'guest-reminder-medicine', patientId: GUEST_PATIENT_ID, title: 'Morning medicine', detail: 'After breakfast • 1 tablet', icon: '💊', time: '08:00', category: 'medicine', completed: false, recurring: true, createdAt: Date.now() },
  { id: 'guest-reminder-water', patientId: GUEST_PATIENT_ID, title: 'Drink water', detail: 'One full glass', icon: '💧', time: '11:00', category: 'water', completed: false, recurring: true, createdAt: Date.now() + 1 },
  { id: 'guest-reminder-family', patientId: GUEST_PATIENT_ID, title: 'Call family', detail: 'A friendly evening call', icon: '📞', time: '18:00', category: 'custom', completed: false, recurring: true, createdAt: Date.now() + 2 },
];

const guestEmergencyContacts: EmergencyContact[] = [
  { id: 'guest-emergency-maya', patientId: GUEST_PATIENT_ID, familyMemberId: 'guest-person-maya', name: 'Maya Morgan', phone: '+91 90000 00000', priority: 1 },
];

export async function startGuestMode(): Promise<void> {
  const profiles = await storageService.getProfiles();
  if (!profiles.some((profile) => profile.id === GUEST_PATIENT_ID)) await storageService.putProfile(guestProfile);
  const people = await storageService.getPersonMemories();
  if (!people.some((person) => person.patient_id === GUEST_PATIENT_ID)) {
    await Promise.all(guestPeople.map((person) => storageService.putPersonMemory(person)));
  }
  const reminders = await storageService.getReminders();
  if (!reminders.some((reminder) => reminder.patientId === GUEST_PATIENT_ID)) {
    await Promise.all(guestReminders.map((reminder) => storageService.putReminder(reminder)));
  }
  const contacts = await storageService.getEmergencyContacts();
  if (!contacts.some((contact) => contact.patientId === GUEST_PATIENT_ID)) {
    await Promise.all(guestEmergencyContacts.map((contact) => storageService.putEmergencyContact(contact)));
  }
}

export async function clearGuestData(): Promise<void> {
  await storageService.deletePatientData(GUEST_PATIENT_ID);
  storageService.remove(GUEST_EMERGENCY_INFO_KEY);
}
