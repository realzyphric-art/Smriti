import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { loadReminders, isCompleteForDate } from '@/services/reminderService';
import { localDateKey } from '@/utils/date';
import type { Reminder } from '@/types';

const REFRESH_MS = 30_000;
const LOOKAHEAD_DAYS = 8;

function nextReminderTime(reminder: Reminder, from = new Date()): Date | null {
  if (!reminder.enabled) return null;
  const start = new Date(from);
  start.setSeconds(0, 0);
  const [hours, minutes] = reminder.time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);
    const date = localDateKey(candidate);
    if (candidate.getTime() < from.getTime()) continue;
    if (!reminder.recurring && reminder.scheduledDate && reminder.scheduledDate !== date) continue;
    if (reminder.repeatDays?.length && !reminder.repeatDays.includes(candidate.getDay())) continue;
    if (isCompleteForDate(reminder, date)) continue;
    return candidate;
  }
  return null;
}

async function showReminderAlarm(reminder: Reminder, date: string): Promise<void> {
  const tag = `smriti-reminder-${reminder.id}-${date}`;
  const options: NotificationOptions = {
    body: reminder.detail || 'It is time for your reminder.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    data: { url: '/reminders', reminderId: reminder.id },
  };

  if ('vibrate' in navigator) navigator.vibrate([240, 120, 240]);
  try {
    if ('serviceWorker' in navigator) {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Service worker timeout')), 2_000)),
      ]);
      await registration.showNotification(reminder.title, options);
      return;
    }
  } catch {
    // Fall through to the browser notification if the worker is unavailable.
  }
  if ('Notification' in window && Notification.permission === 'granted') new Notification(reminder.title, options);
}

/** Keeps local reminder alarms active across every patient route. */
export function ReminderAlarmManager() {
  const { settings } = useSettings();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  ));
  const fired = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      if (!settings.activePatientId) {
        setReminders([]);
        return;
      }
      try {
        const next = await loadReminders(settings.activePatientId);
        if (live) setReminders(next);
      } catch {
        // The visible Reminders page displays its own loading/error state.
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    return () => { live = false; window.clearInterval(interval); };
  }, [settings.activePatientId, settings.guestMode, settings.authenticated]);

  useEffect(() => {
    const refreshPermission = () => {
      setNotificationPermission('Notification' in window ? Notification.permission : 'unsupported');
    };
    refreshPermission();
    window.addEventListener('smriti-notification-permission', refreshPermission);
    const interval = window.setInterval(refreshPermission, 5_000);
    return () => {
      window.removeEventListener('smriti-notification-permission', refreshPermission);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (notificationPermission !== 'granted') return;
    let timer: number | undefined;
    const schedule = () => {
      const now = new Date();
      const upcoming = reminders
        .map((reminder) => ({ reminder, due: nextReminderTime(reminder, now) }))
        .filter((item): item is { reminder: Reminder; due: Date } => item.due !== null)
        .sort((a, b) => a.due.getTime() - b.due.getTime())[0];
      if (!upcoming) return;
      const delay = Math.max(250, upcoming.due.getTime() - Date.now() + 50);
      timer = window.setTimeout(() => {
        const date = localDateKey(upcoming.due);
        const key = `${upcoming.reminder.id}:${date}`;
        const lateBy = Date.now() - upcoming.due.getTime();
        if (lateBy < 2 * 60 * 60 * 1000 && !fired.current.has(key)) {
          fired.current.add(key);
          void showReminderAlarm(upcoming.reminder, date);
        }
        schedule();
      }, delay);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== undefined) window.clearTimeout(timer);
      schedule();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [notificationPermission, reminders]);

  return null;
}
