// ============================================================
// MemoryCare — Storage Service
// IndexedDB for structured game/reminder data (offline-first).
// localStorage for lightweight preferences.
// Falls back to localStorage if IndexedDB is unavailable.
// ============================================================

import type { AISettings, ChatConversation, EmergencyContact, FamilyMember, GameSession, MoodEntry, PatientProfile, PendingSyncOperation, PersonMemory, Reminder } from '@/types';

const DB_NAME = 'memorycare-db';
const DB_VERSION = 5;
const STORE_SESSIONS = 'gameSessions';
const STORE_REMINDERS = 'reminders';
const STORE_PROFILES = 'profiles';
const STORE_FAMILY = 'familyMembers';
const STORE_EMERGENCY = 'emergencyContacts';
const STORE_MOODS = 'moods';
const STORE_PEOPLE = 'personMemories';
const STORE_AI_SETTINGS = 'aiSettings';
const STORE_CHATS = 'chatConversations';
const STORE_SYNC_QUEUE = 'syncQueue';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_REMINDERS)) {
          db.createObjectStore(STORE_REMINDERS, { keyPath: 'id' });
        }
        [STORE_PROFILES, STORE_FAMILY, STORE_EMERGENCY, STORE_MOODS, STORE_PEOPLE, STORE_AI_SETTINGS, STORE_CHATS, STORE_SYNC_QUEUE].forEach((store) => {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // fall back gracefully
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

// ---------- Generic IndexedDB helpers with localStorage fallback ----------

async function idbGetAll<T>(store: string, fallbackKey: string): Promise<T[]> {
  const db = await openDB();
  if (!db) return lsGet<T[]>(fallbackKey, []);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => resolve(lsGet<T[]>(fallbackKey, []));
    } catch {
      resolve(lsGet<T[]>(fallbackKey, []));
    }
  });
}

async function idbPut<T>(
  store: string,
  fallbackKey: string,
  value: T & { id: string },
): Promise<void> {
  const db = await openDB();
  if (!db) {
    const all = lsGet<Array<T & { id: string }>>(fallbackKey, []);
    const idx = all.findIndex((x) => x.id === value.id);
    if (idx >= 0) all[idx] = value;
    else all.push(value);
    lsSet(fallbackKey, all);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(
  store: string,
  fallbackKey: string,
  id: string,
): Promise<void> {
  const db = await openDB();
  if (!db) {
    const all = lsGet<Array<{ id: string }>>(fallbackKey, []);
    lsSet(
      fallbackKey,
      all.filter((x) => x.id !== id),
    );
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---------- localStorage helpers ----------

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — offline demo still works in memory */
  }
}

// ---------- Public API ----------

export const storageService = {
  // Game sessions
  getSessions: () =>
    idbGetAll<GameSession>(STORE_SESSIONS, 'mc:sessions'),
  putSession: (s: GameSession) =>
    idbPut<GameSession>(STORE_SESSIONS, 'mc:sessions', s),

  // Reminders
  getReminders: () => idbGetAll<Reminder>(STORE_REMINDERS, 'mc:reminders'),
  putReminder: (r: Reminder) =>
    idbPut<Reminder>(STORE_REMINDERS, 'mc:reminders', r),
  deleteReminder: (id: string) =>
    idbDelete(STORE_REMINDERS, 'mc:reminders', id),

  // Local schema v2 records. Every record carries a patientId; callers must filter by it.
  getProfiles: () => idbGetAll<PatientProfile>(STORE_PROFILES, 'mc:profiles'),
  putProfile: (v: PatientProfile) => idbPut<PatientProfile>(STORE_PROFILES, 'mc:profiles', v),
  deleteProfile: (id: string) => idbDelete(STORE_PROFILES, 'mc:profiles', id),
  getFamilyMembers: () => idbGetAll<FamilyMember>(STORE_FAMILY, 'mc:family'),
  putFamilyMember: (v: FamilyMember) => idbPut<FamilyMember>(STORE_FAMILY, 'mc:family', v),
  deleteFamilyMember: (id: string) => idbDelete(STORE_FAMILY, 'mc:family', id),
  getEmergencyContacts: () => idbGetAll<EmergencyContact>(STORE_EMERGENCY, 'mc:emergency'),
  putEmergencyContact: (v: EmergencyContact) => idbPut<EmergencyContact>(STORE_EMERGENCY, 'mc:emergency', v),
  deleteEmergencyContact: (id: string) => idbDelete(STORE_EMERGENCY, 'mc:emergency', id),
  getMoods: () => idbGetAll<MoodEntry>(STORE_MOODS, 'mc:moods'),
  putMood: (v: MoodEntry) => idbPut<MoodEntry>(STORE_MOODS, 'mc:moods', v),
  deleteMood: (id: string) => idbDelete(STORE_MOODS, 'mc:moods', id),
  getPersonMemories: () => idbGetAll<PersonMemory>(STORE_PEOPLE, 'mc:person-memories'),
  putPersonMemory: (v: PersonMemory) => idbPut<PersonMemory>(STORE_PEOPLE, 'mc:person-memories', v),
  deletePersonMemory: (id: string) => idbDelete(STORE_PEOPLE, 'mc:person-memories', id),

  // AI credentials stay in IndexedDB, never in the lightweight settings/localStorage bucket.
  getAISettings: async (): Promise<AISettings | null> => {
    const values = await idbGetAll<AISettings>(STORE_AI_SETTINGS, 'mc:ai-settings');
    return values.find((value) => value.id === 'default') ?? null;
  },
  putAISettings: (value: AISettings) => idbPut<AISettings>(STORE_AI_SETTINGS, 'mc:ai-settings', value),
  clearAISettings: () => idbDelete(STORE_AI_SETTINGS, 'mc:ai-settings', 'default'),
  getChatConversations: () => idbGetAll<ChatConversation>(STORE_CHATS, 'mc:chat-conversations'),
  putChatConversation: (value: ChatConversation) => idbPut<ChatConversation>(STORE_CHATS, 'mc:chat-conversations', value),
  deleteChatConversation: (id: string) => idbDelete(STORE_CHATS, 'mc:chat-conversations', id),

  // Offline changes wait here until the next authenticated online sync.
  getSyncQueue: () => idbGetAll<PendingSyncOperation>(STORE_SYNC_QUEUE, 'mc:sync-queue'),
  putSyncOperation: (value: PendingSyncOperation) => idbPut<PendingSyncOperation>(STORE_SYNC_QUEUE, 'mc:sync-queue', value),
  deleteSyncOperation: (id: string) => idbDelete(STORE_SYNC_QUEUE, 'mc:sync-queue', id),

  // Lightweight KV
  get: lsGet,
  set: lsSet,
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* unavailable */ } },
  async deletePatientData(patientId: string): Promise<void> {
    const collections: Array<[string, string]> = [[STORE_SESSIONS, 'mc:sessions'], [STORE_REMINDERS, 'mc:reminders'], [STORE_FAMILY, 'mc:family'], [STORE_EMERGENCY, 'mc:emergency'], [STORE_MOODS, 'mc:moods'], [STORE_PEOPLE, 'mc:person-memories']];
    for (const [store, key] of collections) {
      const values = await idbGetAll<{ id: string; patientId?: string; patient_id?: string }>(store, key);
      await Promise.all(values.filter((v) => (v.patientId ?? v.patient_id) === patientId).map((v) => idbDelete(store, key, v.id)));
    }
    await idbDelete(STORE_PROFILES, 'mc:profiles', patientId);
  },
};
