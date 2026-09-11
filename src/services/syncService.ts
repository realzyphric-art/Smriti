import type { GameSession, PendingSyncOperation, PersonMemory, Reminder } from '@/types';
import { supabase } from '@/lib/supabase';
import { storageService } from './storageService';
import { isGuestPatientId } from './guestService';
import { GAME_DEFINITIONS } from './gameService';
import { touchPatientSync } from './sharingService';
import { savePerson } from './peopleService';

export interface SyncResult { synced: number; pendingBefore: number; }

function online() { return typeof navigator === 'undefined' || navigator.onLine; }

export async function pendingCount(): Promise<number> {
  const sessions = await storageService.getSessions();
  const operations = await storageService.getSyncQueue();
  return sessions.filter((s) => !s.synced).length + operations.length;
}

async function syncGameSession(session: GameSession): Promise<boolean> {
  if (!supabase || isGuestPatientId(session.patientId)) return false;
  const game = GAME_DEFINITIONS[session.gameType];
  const { data: gameRow, error: gameError } = await supabase.from('games').select('id').eq('slug', game.slug).single();
  if (gameError) throw gameError;
  const { data, error } = await supabase.from('game_sessions').upsert({
    patient_id: session.patientId, game_id: gameRow.id, game_type: session.gameType,
    category: session.category ?? game.category, level: session.difficulty ?? session.level,
    score: session.score, accuracy: session.accuracy, attempts: session.attempts,
    mistakes: session.mistakes ?? Math.max(0, session.attempts - Math.round((session.accuracy / 100) * session.attempts)),
    response_time_ms: session.responseTimeMs ?? session.durationSec * 1000, completed: session.completed,
    duration_seconds: session.durationSec, played_at: new Date(session.timestamp).toISOString(),
    client_id: session.clientId ?? session.id,
  }, { onConflict: 'patient_id,client_id' }).select('id').single();
  if (error) throw error;
  const metrics = Object.entries(session.metrics ?? {}).map(([metric_name, value]) => ({
    session_id: data.id, metric_name, metric_value: typeof value === 'number' ? value : 0,
    metric_text: typeof value === 'string' ? value : null,
  }));
  if (metrics.length) {
    const { error: metricsError } = await supabase.from('game_metrics').upsert(metrics, { onConflict: 'session_id,metric_name' });
    if (metricsError) throw metricsError;
  }
  return true;
}

async function syncReminderOperation(operation: PendingSyncOperation): Promise<boolean> {
  if (!supabase || isGuestPatientId(operation.patientId)) return false;
  if (operation.kind === 'reminder-delete') {
    const { error } = await supabase.from('reminders').delete().eq('id', (operation.payload as { id: string }).id);
    if (error) throw error;
    return true;
  }
  if (operation.kind === 'reminder-completion') {
    const payload = operation.payload as { reminderId: string; date: string; complete: boolean };
    if (payload.complete) {
      const { error } = await supabase.from('reminder_completions').upsert({ reminder_id: payload.reminderId, completed_on: payload.date });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('reminder_completions').delete().eq('reminder_id', payload.reminderId).eq('completed_on', payload.date);
      if (error) throw error;
    }
    return true;
  }
  const reminder = operation.payload as Reminder;
  const { error } = await supabase.from('reminders').upsert({
    id: reminder.id, patient_id: reminder.patientId, title: reminder.title, detail: reminder.detail,
    icon: reminder.icon, time_local: reminder.time, category: reminder.category, recurring: reminder.recurring,
    repeat_days: reminder.repeatDays ?? [], enabled: reminder.enabled ?? true, scheduled_date: reminder.scheduledDate ?? null,
  });
  if (error) throw error;
  return true;
}

async function syncPersonOperation(operation: PendingSyncOperation): Promise<boolean> {
  if (!supabase || isGuestPatientId(operation.patientId)) return false;
  if (operation.kind === 'person-delete') {
    const { error } = await supabase.from('person_memories').delete().eq('id', (operation.payload as { id: string }).id);
    if (error) throw error;
    return true;
  }
  const person = operation.payload as PersonMemory;
  const photoFiles: File[] = [];
  for (const [index, path] of (person.photo_paths ?? []).entries()) {
    if (!path.startsWith('data:')) continue;
    const response = await fetch(path);
    photoFiles.push(new File([await response.blob()], `offline-photo-${index}.jpg`, { type: response.headers.get('content-type') ?? 'image/jpeg' }));
  }
  if (photoFiles.length > 0) {
    const saved = await savePerson(person, photoFiles, null, false);
    return !saved.syncPending;
  }
  const { error } = await supabase.from('person_memories').upsert({
    id: person.id, patient_id: person.patient_id, name: person.name, relationship: person.relationship,
    nickname: person.nickname ?? null, photo_path: person.photo_path ?? null, photo_paths: person.photo_paths ?? [],
    notes: person.notes ?? null, voice_recording_path: person.voice_recording_path ?? null,
  });
  if (error) throw error;
  return true;
}

export async function syncNow(): Promise<SyncResult> {
  const sessions = await storageService.getSessions();
  const operations = (await storageService.getSyncQueue()).sort((a, b) => a.createdAt - b.createdAt);
  const pendingBefore = sessions.filter((s) => !s.synced).length + operations.length;
  if (!supabase || !online()) return { synced: 0, pendingBefore };
  let synced = 0;
  const changedPatients = new Set<string>();
  for (const session of sessions.filter((s) => !s.synced)) {
    try {
      if (await syncGameSession(session)) {
        await storageService.putSession({ ...session, synced: true }); synced += 1; changedPatients.add(session.patientId);
      }
    } catch { /* retain for retry */ }
  }
  for (const operation of operations) {
    try {
      const done = operation.kind.startsWith('reminder-') ? await syncReminderOperation(operation) : await syncPersonOperation(operation);
      if (!done) continue;
      await storageService.deleteSyncOperation(operation.id); synced += 1; changedPatients.add(operation.patientId);
    } catch { /* retain for retry */ }
  }
  await Promise.all([...changedPatients].map((patientId) => touchPatientSync(patientId).catch(() => undefined)));
  return { synced, pendingBefore };
}
