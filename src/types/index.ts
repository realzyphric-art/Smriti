// ============================================================
// Smriti — Shared Types
// ============================================================

export type LanguageCode = 'en' | 'hi' | 'as' | 'bn';

export type UserRole = 'patient' | 'caregiver';
export type ThemePreference = 'system' | 'light' | 'dark';
export type AppRole = UserRole;

export type AIProvider = 'openai' | 'qwen' | 'openrouter';

export interface AISettings {
  id: 'default';
  provider: AIProvider;
  model: string;
  apiKey: string;
  updatedAt: number;
}

export type ChatMessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: number;
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface PatientRecord {
  id: string;
  auth_user_id?: string | null;
  name: string;
  profile_photo_path?: string | null;
  date_of_birth?: string | null;
  notes?: string | null;
  interests?: string | null;
  share_with_caregiver: boolean;
  updated_at?: string;
}

export interface CaregiverLink {
  id: string;
  caregiver_id: string;
  patient_id: string;
  caregiver_name: string;
  patient_name: string;
  status: 'pending' | 'active' | 'revoked';
  created_at: string;
  updated_at: string;
}

export type PersonRelationship = 'family' | 'friend' | 'caregiver' | 'clinician' | 'other';
export interface PersonMemory {
  id: string;
  patient_id: string;
  name: string;
  relationship: PersonRelationship;
  nickname?: string | null;
  photo_path?: string | null;
  photo_paths?: string[] | null;
  notes?: string | null;
  voice_recording_path?: string | null;
  syncPending?: boolean;
}

/** The one profile currently in use on this device. */
export interface ActiveProfile {
  id: string;
  patientName: string;
  caregiverName: string;
  role: UserRole;
  avatarUrl?: string | null;
}

export type GameType = 'picture-pairs' | 'pattern-recall' | 'daily-routine' | 'who-is-this-person';
export type CognitiveCategory = 'Memory' | 'Attention' | 'Sequence' | 'Reasoning' | 'Daily Routine';

export interface StandardGameSession {
  id: string;
  patientId: string;
  gameType: GameType;
  category: CognitiveCategory;
  difficulty: number;
  score: number;
  accuracy: number;
  responseTimeMs: number;
  mistakes: number;
  attempts: number;
  completed: boolean;
  timestamp: number;
  metrics: Record<string, number | string | boolean>;
}

export interface AccessibilitySettings {
  largeText: boolean;
  jumboButtons: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

export interface AppSettings {
  onboarded: boolean;
  role: UserRole;
  language: LanguageCode;
  patientName: string;
  caregiverName: string;
  voiceEnabled: boolean;
  accessibility: AccessibilitySettings;
  emergencyContact: string;
  shareWithCaregiver: boolean;
  activePatientId?: string;
  userName?: string;
  authenticated?: boolean;
  guestMode?: boolean;
  needsRoleSelection?: boolean;
  theme?: ThemePreference;
  activeProfile?: ActiveProfile;
}

export interface PatientProfile {
  id: string;
  name: string;
  createdAt: number;
  shareWithCaregiver: boolean;
  profilePhotoUrl?: string | null;
  dateOfBirth?: string | null;
  notes?: string;
  interests?: string;
}

export interface FamilyMember {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  phone: string;
  role: 'caregiver' | 'family' | 'emergency' | 'clinician';
  email?: string;
}

export interface EmergencyContact {
  id: string;
  patientId: string;
  familyMemberId?: string;
  name: string;
  phone: string;
  priority: number;
}

export type Mood = 'happy' | 'calm' | 'neutral' | 'sad' | 'worried';
export interface MoodEntry { id: string; patientId: string; mood: Mood; note?: string; date: string; createdAt: number; }

/** A single completed (or attempted) game session. */
export interface GameSession {
  id: string;
  patientId: string;
  gameType: GameType;
  level: number;
  score: number; // 0–100 (accuracy percentage)
  accuracy: number; // 0–100
  attempts: number;
  completed: boolean;
  durationSec: number;
  timestamp: number; // epoch ms
  synced: boolean;
  category?: CognitiveCategory;
  difficulty?: number;
  mistakes?: number;
  responseTimeMs?: number;
  metrics?: Record<string, number | string | boolean>;
  clientId?: string;
}

export interface Reminder {
  id: string;
  patientId: string;
  title: string;
  detail: string;
  icon: string; // emoji
  time: string; // "HH:MM" 24h
  category: 'medicine' | 'meal' | 'water' | 'appointment' | 'exercise' | 'game' | 'custom';
  completed: boolean;
  completedAt?: number;
  recurring: boolean;
  repeatDays?: number[]; // 0 Sunday through 6 Saturday
  enabled?: boolean;
  assignedFamilyMemberId?: string;
  completionDates?: string[]; // local YYYY-MM-DD buckets
  createdAt: number;
  scheduledDate?: string;
  syncPending?: boolean;
}

export type SyncOperationKind = 'reminder-upsert' | 'reminder-delete' | 'reminder-completion' | 'person-upsert' | 'person-delete';

export interface PendingSyncOperation {
  id: string;
  kind: SyncOperationKind;
  patientId: string;
  payload: unknown;
  createdAt: number;
}

export interface EmergencyContactRecord { id: string; patient_id: string; name: string; phone: string; priority: number; }
export interface EmergencyInfo { patient_id: string; emergency_number?: string | null; emergency_notes?: string | null; }

/** Per-game adaptive difficulty level (1..5). */
export type LevelMap = Record<GameType, number>;

export interface DailyProgress {
  date: string; // YYYY-MM-DD
  gamesCompleted: number;
  averageScore: number;
  minutesActive: number;
}

export interface ProgressSummary {
  gamesCompleted: number;
  averageScore: number;
  currentLevel: number;
  streakDays: number;
  weekly: DailyProgress[]; // last 7 days, Mon..Sun order
  daysPlayedThisWeek: number;
}

export interface GameResultData {
  gameType: GameType;
  score: number;
  accuracy: number;
  attempts: number;
  previousLevel: number;
  newLevel: number;
  levelChange: 'up' | 'same' | 'down';
  durationSec: number;
}
