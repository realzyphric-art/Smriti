import { useCallback, useEffect, useState } from 'react';
import type { Reminder } from '@/types';
import {
  addReminder,
  loadReminders,
  removeReminder,
  sortReminders,
  toggleReminder,
  updateReminder,
} from '@/services/reminderService';
import { useSettings } from './useSettings';

export function useReminders() {
  const { settings } = useSettings();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await loadReminders(settings.activePatientId);
      setReminders(list); setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reminders.');
    } finally { setLoading(false); }
  }, [settings.activePatientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(async (r: Reminder) => {
    const updated = await toggleReminder(r);
    setReminders((prev) =>
      sortReminders(prev.map((x) => (x.id === updated.id ? updated : x))),
    );
  }, []);

  const add = useCallback(
    async (data: Omit<Reminder, 'id' | 'patientId' | 'completed' | 'createdAt'>) => {
      if (!settings.activePatientId) return;
      const created = await addReminder({ ...data, patientId: settings.activePatientId });
      setReminders((prev) => sortReminders([...prev, created]));
    },
    [settings.activePatientId],
  );

  const edit = useCallback(async (r: Reminder) => {
    await updateReminder(r);
    setReminders((prev) => sortReminders(prev.map((x) => (x.id === r.id ? r : x))));
  }, []);

  const remove = useCallback(async (id: string) => {
    await removeReminder(id);
    setReminders((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const completedCount = reminders.filter((r) => r.completed).length;

  return { reminders, loading, error, reload, toggle, add, edit, remove, completedCount };
}
