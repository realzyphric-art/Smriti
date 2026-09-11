// ============================================================
// MemoryCare — Reminder Service
// CRUD + default seed + time helpers. Persists via storageService.
// ============================================================

import type { PendingSyncOperation, Reminder } from '@/types';
import { storageService } from './storageService';
import { localDateKey } from '@/utils/date';
import { supabase } from '@/lib/supabase';
import { isGuestPatientId } from './guestService';
import { touchPatientSync } from './sharingService';

function id(): string {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function guestId(): string {
  return `guest-reminder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function queueId(kind: PendingSyncOperation['kind'], id: string) {
  return `${kind}:${id}`;
}

async function queue(kind: PendingSyncOperation['kind'], reminder: Reminder, payload: unknown) {
  await storageService.putSyncOperation({ id: queueId(kind, reminder.id), kind, patientId: reminder.patientId, payload, createdAt: Date.now() });
}

function localReminder(data: Omit<Reminder, 'id' | 'completed' | 'createdAt'>, reminderId = id()): Reminder {
  return { ...data, id: reminderId, completed: false, createdAt: Date.now(), syncPending: true };
}

function fromCloud(row: any): Reminder {
  return { id: row.id, patientId: row.patient_id, title: row.title, detail: row.detail, icon: row.icon, time: String(row.time_local).slice(0, 5), category: row.category, completed: Boolean(row.reminder_completions?.some((c: { completed_on: string }) => c.completed_on === localDateKey())), recurring: row.recurring, repeatDays: row.repeat_days, enabled: row.enabled, completionDates: row.reminder_completions?.map((c: { completed_on: string }) => c.completed_on), createdAt: new Date(row.created_at).getTime(), scheduledDate: row.scheduled_date ?? undefined, syncPending: false };
}

/** Default gentle daily reminders (created on first run only). */
export function defaultReminders(patientId = ''): Reminder[] {
  const now = Date.now();
  return [
    {
      id: id(),
      patientId,
      title: 'Morning Medicine',
      detail: 'After breakfast • 1 tablet',
      icon: '💊',
      time: '08:00',
      category: 'medicine',
      completed: false,
      recurring: true,
      createdAt: now,
    },
    {
      id: id(),
      patientId,
      title: 'Drink Water',
      detail: '1 full glass',
      icon: '💧',
      time: '11:00',
      category: 'water',
      completed: false,
      recurring: true,
      createdAt: now + 1,
    },
    {
      id: id(),
      patientId,
      title: 'Nutritious Lunch',
      detail: 'Roti, dal & fresh vegetables',
      icon: '🍎',
      time: '13:00',
      category: 'meal',
      completed: false,
      recurring: true,
      createdAt: now + 2,
    },
    {
      id: id(),
      patientId,
      title: 'Call Family',
      detail: 'Family • video or phone call',
      icon: '📞',
      time: '18:00',
      category: 'custom',
      completed: false,
      recurring: true,
      createdAt: now + 3,
    },
  ];
}

export async function loadReminders(patientId?: string): Promise<Reminder[]> {
  if (supabase && patientId && !isGuestPatientId(patientId)) {
    try {
      const { data, error } = await supabase.from('reminders').select('*, reminder_completions(completed_on, completed_at)').eq('patient_id', patientId).order('time_local');
      if (error) throw error;
      const reminders = (data ?? []).map(fromCloud);
      await Promise.all(reminders.map((reminder) => storageService.putReminder(reminder)));
      return reminders;
    } catch {
      const cached = await storageService.getReminders();
      return sortReminders(cached.filter((r) => r.patientId === patientId));
    }
  }
  const list = await storageService.getReminders();
  return sortReminders(patientId ? list.filter((r) => r.patientId === patientId) : list);
}

export function sortReminders(list: Reminder[]): Reminder[] {
  return [...list].sort((a, b) => a.time.localeCompare(b.time));
}

export async function addReminder(
  data: Omit<Reminder, 'id' | 'completed' | 'createdAt'>,
): Promise<Reminder> {
  if (supabase && !isGuestPatientId(data.patientId)) {
    if (navigator.onLine) {
      try {
        const { data: row, error } = await supabase.from('reminders').insert({ patient_id: data.patientId, title: data.title, detail: data.detail, icon: data.icon, time_local: data.time, category: data.category, recurring: data.recurring, repeat_days: data.repeatDays ?? [], enabled: data.enabled ?? true, scheduled_date: data.scheduledDate ?? null }).select().single();
        if (error) throw error;
        const reminder = { ...data, id: row.id, completed: false, createdAt: new Date(row.created_at).getTime(), syncPending: false };
        await storageService.putReminder(reminder);
        await touchPatientSync(data.patientId).catch(() => undefined);
        return reminder;
      } catch { /* fall through to the offline queue */ }
    }
    const reminder = localReminder(data);
    await storageService.putReminder(reminder); await queue('reminder-upsert', reminder, reminder); return reminder;
  }
  const reminder: Reminder = {
    ...data,
    id: isGuestPatientId(data.patientId) ? guestId() : id(),
    completed: false,
    createdAt: Date.now(),
  };
  await storageService.putReminder(reminder);
  return reminder;
}

export async function updateReminder(r: Reminder): Promise<void> {
  if (supabase && !isGuestPatientId(r.patientId)) {
    if (navigator.onLine) {
      try {
        const { error } = await supabase.from('reminders').update({ title: r.title, detail: r.detail, icon: r.icon, time_local: r.time, category: r.category, recurring: r.recurring, repeat_days: r.repeatDays ?? [], enabled: r.enabled ?? true, scheduled_date: r.scheduledDate ?? null }).eq('id', r.id);
        if (error) throw error;
        await storageService.putReminder({ ...r, syncPending: false }); await touchPatientSync(r.patientId).catch(() => undefined); return;
      } catch { /* fall through to the offline queue */ }
    }
    const pending = { ...r, syncPending: true }; await storageService.putReminder(pending); await queue('reminder-upsert', pending, pending); return;
  }
  await storageService.putReminder(r);
}

export async function toggleReminder(r: Reminder): Promise<Reminder> {
  const date = localDateKey();
  const complete = !isCompleteForDate(r, date);
  if (supabase && !isGuestPatientId(r.patientId)) {
    const updated = { ...r, completed: complete, completedAt: complete ? Date.now() : undefined, completionDates: complete ? [...new Set([...(r.completionDates ?? []), date])] : (r.completionDates ?? []).filter((d) => d !== date), syncPending: false };
    if (navigator.onLine) {
      try {
        if (complete) { const { error } = await supabase.from('reminder_completions').upsert({ reminder_id: r.id, completed_on: date }); if (error) throw error; }
        else { const { error } = await supabase.from('reminder_completions').delete().eq('reminder_id', r.id).eq('completed_on', date); if (error) throw error; }
        await storageService.putReminder(updated); await touchPatientSync(r.patientId).catch(() => undefined); return updated;
      } catch { /* fall through to the offline queue */ }
    }
    const pending = { ...updated, syncPending: true }; await storageService.putReminder(pending); await queue('reminder-completion', pending, { reminderId: r.id, date, complete }); return pending;
  }
  const updated: Reminder = {
    ...r,
    completed: complete,
    completedAt: complete ? Date.now() : undefined,
    completionDates: complete ? [...new Set([...(r.completionDates ?? []), date])] : (r.completionDates ?? []).filter((d) => d !== date),
  };
  await storageService.putReminder(updated);
  return updated;
}

export function isCompleteForDate(r: Reminder, date = localDateKey()): boolean {
  return r.recurring ? (r.completionDates ?? []).includes(date) : r.completed;
}

export function reminderStatus(r: Reminder, now = new Date()): 'upcoming' | 'due' | 'completed' | 'missed' {
  if (!r.enabled) return 'upcoming';
  if (isCompleteForDate(r)) return 'completed';
  const today = localDateKey(now);
  if (!r.recurring && r.scheduledDate && r.scheduledDate > today) return 'upcoming';
  if (!r.recurring && r.scheduledDate && r.scheduledDate < today) return 'missed';
  if (r.repeatDays?.length && !r.repeatDays.includes(now.getDay())) return 'upcoming';
  const [hours, minutes] = r.time.split(':').map(Number);
  const due = new Date(now); due.setHours(hours, minutes, 0, 0);
  if (now.getTime() > due.getTime()) return 'missed';
  if (now.getTime() === due.getTime()) return 'due';
  return 'upcoming';
}

export async function removeReminder(rid: string): Promise<void> {
  if (supabase && !rid.startsWith('guest-reminder-')) {
    const cached = (await storageService.getReminders()).find((reminder) => reminder.id === rid);
    if (navigator.onLine) { try { const { error } = await supabase.from('reminders').delete().eq('id', rid); if (error) throw error; await storageService.deleteReminder(rid); return; } catch { /* fall through to the offline queue */ } }
    if (cached) await queue('reminder-delete', cached, { id: rid });
    await storageService.deleteReminder(rid); return;
  }
  await storageService.deleteReminder(rid);
}

/** "08:00" -> "8:00 AM" for large, friendly display. */
export function formatTime(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}
